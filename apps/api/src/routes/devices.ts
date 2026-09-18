import type { FastifyInstance } from "fastify";
import { prisma } from "@devicefarm/database";
import { authenticate } from "../auth/middleware";

export async function devicesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/api/devices", async (req) => {
    const { deviceProfileId, status } = req.query as { deviceProfileId?: string; status?: string };
    const devices = await prisma.device.findMany({
      where: {
        deviceProfileId: deviceProfileId || undefined,
        status: (status as "AVAILABLE" | "STARTING" | "RUNNING" | "BUSY" | "OFFLINE" | "MAINTENANCE" | undefined) || undefined,
      },
      include: { deviceProfile: true, computeHost: { select: { id: true, name: true, status: true } } },
      orderBy: { label: "asc" },
    });
    return { devices };
  });
}
