import { PrismaClient, DeviceArchitecture, FormFactor, ComputeProviderType, ComputeHostStatus, DeviceStatus, OrgRole } from "../generated/client";
import { randomUUID } from "node:crypto";
import { scryptSync, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const DEVICE_PROFILES = [
  {
    name: "Pixel 7",
    androidVersion: "13",
    apiLevel: 33,
    resolutionWidth: 1080,
    resolutionHeight: 2400,
    densityDpi: 420,
    cpuCores: 4,
    ramMb: 4096,
    storageMb: 8192,
    architecture: DeviceArchitecture.X86_64,
    formFactor: FormFactor.PHONE,
    emulatorImage: "system-images;android-33;google_apis;x86_64",
  },
  {
    name: "Pixel 8",
    androidVersion: "14",
    apiLevel: 34,
    resolutionWidth: 1080,
    resolutionHeight: 2400,
    densityDpi: 428,
    cpuCores: 4,
    ramMb: 4096,
    storageMb: 8192,
    architecture: DeviceArchitecture.X86_64,
    formFactor: FormFactor.PHONE,
    emulatorImage: "system-images;android-34;google_apis;x86_64",
  },
  {
    name: "Pixel 9",
    androidVersion: "15",
    apiLevel: 35,
    resolutionWidth: 1080,
    resolutionHeight: 2424,
    densityDpi: 422,
    cpuCores: 4,
    ramMb: 6144,
    storageMb: 8192,
    architecture: DeviceArchitecture.X86_64,
    formFactor: FormFactor.PHONE,
    emulatorImage: "system-images;android-35;google_apis;x86_64",
  },
  {
    name: "Pixel 9 Pro (ARM)",
    androidVersion: "15",
    apiLevel: 35,
    resolutionWidth: 1280,
    resolutionHeight: 2856,
    densityDpi: 480,
    cpuCores: 4,
    ramMb: 8192,
    storageMb: 8192,
    architecture: DeviceArchitecture.ARM64,
    formFactor: FormFactor.PHONE,
    emulatorImage: "system-images;android-35;google_apis;arm64-v8a",
  },
  {
    name: "Android Tablet",
    androidVersion: "14",
    apiLevel: 34,
    resolutionWidth: 1600,
    resolutionHeight: 2560,
    densityDpi: 320,
    cpuCores: 4,
    ramMb: 4096,
    storageMb: 8192,
    architecture: DeviceArchitecture.X86_64,
    formFactor: FormFactor.TABLET,
    emulatorImage: "system-images;android-34;google_apis;x86_64",
  },
] as const;

async function main() {
  console.log("Seeding device profiles...");
  for (const profile of DEVICE_PROFILES) {
    const existing = await prisma.deviceProfile.findFirst({
      where: { name: profile.name, apiLevel: profile.apiLevel, architecture: profile.architecture },
    });
    const profileRow =
      existing ??
      (await prisma.deviceProfile.create({ data: profile }));

    // Seed a handful of bookable device slots per profile so the Device Lab
    // page has something to show before any real compute host registers.
    const slotCount = await prisma.device.count({ where: { deviceProfileId: profileRow.id } });
    if (slotCount === 0) {
      await prisma.device.createMany({
        data: Array.from({ length: 3 }).map((_, i) => ({
          deviceProfileId: profileRow.id,
          label: `${profile.name.toLowerCase().replace(/\s+/g, "-")}-${i + 1}`,
          status: DeviceStatus.OFFLINE,
        })),
      });
    }
  }

  console.log("Seeding local compute host...");
  const localHost = await prisma.computeHost.findFirst({ where: { hostname: "localhost" } });
  if (!localHost) {
    await prisma.computeHost.create({
      data: {
        name: "local-dev-host",
        providerType: ComputeProviderType.LOCAL,
        hostname: "localhost",
        region: "local",
        cpuCapacityMillicores: 8000,
        ramCapacityMb: 16384,
        diskCapacityMb: 204800,
        gpuAvailable: false,
        kvmEnabled: false,
        maxConcurrentEmulators: 4,
        status: ComputeHostStatus.HEALTHY,
        lastHeartbeatAt: new Date(),
        metadata: { note: "Seeded for local development. Set kvmEnabled=true once real KVM host is registered." },
      },
    });
  }

  console.log("Seeding demo user / organization / project...");
  const email = "demo@devicefarm.dev";
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: "Demo User",
        passwordHash: hashPassword("password123"),
        emailVerifiedAt: new Date(),
      },
    });
  }

  let org = await prisma.organization.findUnique({ where: { slug: "demo-org" } });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: "Demo Org", slug: "demo-org", plan: "FREE" },
    });
    await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: OrgRole.OWNER },
    });
    await prisma.subscription.create({
      data: {
        organizationId: org.id,
        plan: "FREE",
        deviceMinutesLimit: 30,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  let project = await prisma.project.findFirst({ where: { organizationId: org.id, slug: "default" } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        organizationId: org.id,
        name: "Default Project",
        slug: "default",
        description: "Auto-created default project",
      },
    });
  }

  console.log("Done. Demo login: demo@devicefarm.dev / password123");
  void randomUUID;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
