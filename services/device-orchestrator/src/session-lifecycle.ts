import { randomUUID, randomBytes } from "node:crypto";
import { prisma } from "@devicefarm/database";
import type { ComputeHost } from "@devicefarm/database";
import { loadEnv } from "@devicefarm/config";
import { scheduler, type SchedulingCandidate } from "@devicefarm/scheduler";
import { resourceRequirementForProfile, type DeviceProfileSpec, type ComputeHostSnapshot } from "@devicefarm/device-types";
import { presignedGetUrl, BUCKETS } from "@devicefarm/storage";
import { computeProviderFor } from "./compute-providers";
import { emitProgress } from "./events";
import { emulatorBootDuration, sessionFailuresTotal, sessionStartDuration } from "./metrics";

export class SessionFailedError extends Error {}

/**
 * The full "Start Device" workflow from the spec, steps 1-12, run inside a
 * single BullMQ job so a crashed orchestrator process can resume/retry
 * cleanly (the job stays in the queue until it succeeds or exhausts
 * retries). Every step emits a SessionProgressEvent so the frontend's
 * progress panel updates in real time.
 */
export async function runSessionLifecycle(sessionId: string): Promise<void> {
  const jobStartedAt = Date.now();
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: { appVersion: { include: { app: true } }, deviceProfile: true },
  });

  try {
    await emitProgress(sessionId, "QUEUED");
    await prisma.session.update({ where: { id: sessionId }, data: { status: "CREATING" } });

    // 1 & 2. Select an appropriate compute host --------------------------------
    await emitProgress(sessionId, "SELECTING_HOST");
    const host = await selectHost(session.deviceProfile);

    // 3. Create an emulator instance --------------------------------------------
    await emitProgress(sessionId, "CREATING_INSTANCE");
    const provider = computeProviderFor(host);
    await provider.ensureHostReady(host);
    const client = provider.client(host);

    const instanceId = randomUUID();
    const deviceProfileSpec: DeviceProfileSpec = {
      id: session.deviceProfile.id,
      name: session.deviceProfile.name,
      platform: "ANDROID",
      androidVersion: session.deviceProfile.androidVersion,
      apiLevel: session.deviceProfile.apiLevel,
      resolutionWidth: session.deviceProfile.resolutionWidth,
      resolutionHeight: session.deviceProfile.resolutionHeight,
      densityDpi: session.deviceProfile.densityDpi,
      cpuCores: session.deviceProfile.cpuCores,
      ramMb: session.deviceProfile.ramMb,
      storageMb: session.deviceProfile.storageMb,
      architecture: session.deviceProfile.architecture,
      emulatorImage: session.deviceProfile.emulatorImage,
    };
    const resourceLimits = resourceRequirementForProfile(deviceProfileSpec);

    // 4. Allocate CPU/RAM/storage -------------------------------------------------
    await emitProgress(sessionId, "ALLOCATING_RESOURCES");
    const env = loadEnv();
    const emulatorInstance = await prisma.emulatorInstance.create({
      data: {
        id: instanceId,
        computeHostId: host.id,
        deviceProfileId: session.deviceProfileId,
        provider: env.EMULATOR_PROVIDER === "real" ? "REAL_ANDROID_EMULATOR" : "MOCK",
        avdName: `session_${instanceId.slice(0, 20)}`,
        dataDir: `${env.EMULATOR_DATA_ROOT}/${instanceId}`,
        status: "PROVISIONING",
        cpuLimitCores: session.deviceProfile.cpuCores,
        ramLimitMb: session.deviceProfile.ramMb,
        diskLimitMb: session.deviceProfile.storageMb,
        bootStartedAt: new Date(),
      },
    });
    await prisma.session.update({ where: { id: sessionId }, data: { emulatorInstanceId: instanceId } });

    const availableDevice = await prisma.device.findFirst({
      where: { deviceProfileId: session.deviceProfileId, status: { in: ["AVAILABLE", "OFFLINE"] } },
    });
    if (availableDevice) {
      await prisma.device.update({
        where: { id: availableDevice.id },
        data: { status: "BUSY", computeHostId: host.id, lastHeartbeatAt: new Date() },
      });
      await prisma.emulatorInstance.update({ where: { id: instanceId }, data: { deviceId: availableDevice.id } });
    }

    // 5 & 6. Load a clean snapshot & boot Android --------------------------------
    await prisma.session.update({ where: { id: sessionId }, data: { status: "BOOTING" } });
    await emitProgress(sessionId, "BOOTING_ANDROID");
    await prisma.emulatorInstance.update({ where: { id: instanceId }, data: { status: "BOOTING" } });

    const bootStartedAt = Date.now();
    const { handle } = await client.createInstance({
      instanceId,
      sessionId,
      deviceProfile: deviceProfileSpec,
      resourceLimits,
    });
    emulatorBootDuration.observe((Date.now() - bootStartedAt) / 1000);

    await prisma.emulatorInstance.update({
      where: { id: instanceId },
      data: {
        status: "READY",
        avdName: handle.avdName,
        adbSerial: handle.adbSerial,
        consolePort: handle.consolePort,
        bootCompletedAt: new Date(),
      },
    });

    // 7. Wait for Android to become ready (createInstance already blocks on this on the worker side) ----
    // 8. Install the APK ----------------------------------------------------------
    await prisma.session.update({ where: { id: sessionId }, data: { status: "INSTALLING" } });
    await emitProgress(sessionId, "INSTALLING_APPLICATION");
    const apkUrl = await presignedGetUrl(BUCKETS.apps, session.appVersion.storageKey, 3600);

    // 9. Launch the application ----------------------------------------------------
    await prisma.session.update({ where: { id: sessionId }, data: { status: "STARTING" } });
    await emitProgress(sessionId, "STARTING_APPLICATION");
    await client.installAndLaunch(instanceId, apkUrl, session.appVersion.app.packageName);

    // 10 & 11. Start streaming connection / ready for the browser to connect ------
    await emitProgress(sessionId, "CONNECTING_STREAM");
    const streamingToken = randomBytes(24).toString("hex");

    // 12. Mark session as READY -----------------------------------------------------
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "RUNNING", streamingToken, startedAt: new Date(), lastActivityAt: new Date() },
    });
    await emitProgress(sessionId, "READY");
    sessionStartDuration.observe((Date.now() - jobStartedAt) / 1000);
  } catch (err) {
    sessionFailuresTotal.inc();
    const message = err instanceof Error ? err.message : String(err);
    await prisma.session
      .update({ where: { id: sessionId }, data: { status: "FAILED", errorMessage: message, endedAt: new Date() } })
      .catch(() => undefined);
    await emitProgress(sessionId, "FAILED", message).catch(() => undefined);
    await cleanupFailedInstance(sessionId).catch(() => undefined);
    throw new SessionFailedError(message);
  }
}

async function cleanupFailedInstance(sessionId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { emulatorInstance: { include: { computeHost: true } } },
  });
  if (!session?.emulatorInstance) return;
  const host = session.emulatorInstance.computeHost;
  const client = computeProviderFor(host).client(host);
  await client.destroyInstance(session.emulatorInstance.id).catch(() => undefined);
  await prisma.emulatorInstance.update({
    where: { id: session.emulatorInstance.id },
    data: { status: "FAILED", destroyedAt: new Date() },
  });
}

async function selectHost(deviceProfile: { id: string; ramMb: number; cpuCores: number; storageMb: number }): Promise<ComputeHost> {
  const hosts = await prisma.computeHost.findMany({ where: { status: { not: "OFFLINE" } } });
  if (hosts.length === 0) {
    throw new Error("No compute hosts are registered. Add one from the Admin Dashboard first.");
  }

  const runningCounts = await prisma.emulatorInstance.groupBy({
    by: ["computeHostId"],
    where: { status: { in: ["PROVISIONING", "BOOTING", "READY", "BUSY", "RESETTING"] } },
    _count: { _all: true },
  });
  const runningByHost = new Map(runningCounts.map((r) => [r.computeHostId, r._count._all]));

  const candidates: SchedulingCandidate[] = hosts.map((h) => ({
    host: toSnapshot(h, runningByHost.get(h.id) ?? 0),
    // MVP assumption: every registered host has every seeded device profile's
    // system image available. Track per-host image inventory once hosts are
    // heterogeneous.
    hasImageAvailable: true,
  }));

  const requirement = resourceRequirementForProfile({
    id: deviceProfile.id,
    name: "",
    platform: "ANDROID",
    androidVersion: "",
    apiLevel: 0,
    resolutionWidth: 0,
    resolutionHeight: 0,
    densityDpi: 0,
    cpuCores: deviceProfile.cpuCores,
    ramMb: deviceProfile.ramMb,
    storageMb: deviceProfile.storageMb,
    architecture: "X86_64",
    emulatorImage: "",
  });

  const chosen = scheduler.selectHost(requirement, candidates);
  return hosts.find((h) => h.id === chosen.id)!;
}

function toSnapshot(host: ComputeHost, runningInstanceCount: number): ComputeHostSnapshot {
  return {
    id: host.id,
    name: host.name,
    providerType: host.providerType,
    status: host.status,
    kvmEnabled: host.kvmEnabled,
    gpuAvailable: host.gpuAvailable,
    cpuCapacityMillicores: host.cpuCapacityMillicores,
    ramCapacityMb: host.ramCapacityMb,
    diskCapacityMb: host.diskCapacityMb,
    cpuUsagePercent: host.cpuUsagePercent,
    ramUsagePercent: host.ramUsagePercent,
    diskUsagePercent: host.diskUsagePercent,
    runningInstanceCount,
    maxConcurrentEmulators: host.maxConcurrentEmulators,
  };
}
