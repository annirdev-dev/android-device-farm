import type { FastifyInstance } from "fastify";
import { prisma } from "@devicefarm/database";
import { authenticate, requirePlatformAdmin } from "../auth/middleware";

export async function deviceProfileRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/api/device-profiles", async (req) => {
    const query = req.query as {
      androidVersion?: string;
      apiLevel?: string;
      architecture?: string;
      formFactor?: string;
      minWidth?: string;
    };

    const profiles = await prisma.deviceProfile.findMany({
      where: {
        isEnabled: true,
        androidVersion: query.androidVersion || undefined,
        apiLevel: query.apiLevel ? Number(query.apiLevel) : undefined,
        architecture: (query.architecture as "X86_64" | "ARM64" | undefined) || undefined,
        formFactor: (query.formFactor as "PHONE" | "TABLET" | undefined) || undefined,
        resolutionWidth: query.minWidth ? { gte: Number(query.minWidth) } : undefined,
      },
      include: { _count: { select: { devices: true } } },
      orderBy: [{ apiLevel: "desc" }, { name: "asc" }],
    });

    const availability = await prisma.device.groupBy({
      by: ["deviceProfileId", "status"],
      _count: { _all: true },
    });

    return {
      profiles: profiles.map((p) => ({
        ...p,
        availability: Object.fromEntries(
          availability.filter((a) => a.deviceProfileId === p.id).map((a) => [a.status, a._count._all]),
        ),
      })),
    };
  });

  app.patch("/api/device-profiles/:id", async (req) => {
    requirePlatformAdmin(req);
    const { id } = req.params as { id: string };
    const { isEnabled } = req.body as { isEnabled: boolean };
    const profile = await prisma.deviceProfile.update({ where: { id }, data: { isEnabled } });
    return { profile };
  });
}
