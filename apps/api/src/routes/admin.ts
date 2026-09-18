import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@devicefarm/database";
import { paginate, paginationQuerySchema, offsetFor, NotFoundError } from "@devicefarm/shared";
import { authenticate, requirePlatformAdmin } from "../auth/middleware";
import { sessionCleanupQueue } from "../lib/queues";

const createHostSchema = z.object({
  name: z.string().min(1),
  providerType: z.enum(["LOCAL", "DOCKER", "KUBERNETES", "CLOUD"]),
  hostname: z.string().min(1),
  region: z.string().default("local"),
  cpuCapacityMillicores: z.number().int().positive(),
  ramCapacityMb: z.number().int().positive(),
  diskCapacityMb: z.number().int().positive(),
  gpuAvailable: z.boolean().default(false),
  kvmEnabled: z.boolean().default(false),
  maxConcurrentEmulators: z.number().int().positive().default(4),
  workerPort: z.number().int().positive().default(4200),
});

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", async (req) => requirePlatformAdmin(req));

  app.get("/api/admin/overview", async () => {
    const [users, organizations, activeSessions, failedSessions, computeHosts, emulatorInstances] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.organization.count({ where: { deletedAt: null } }),
      prisma.session.count({ where: { status: { in: ["CREATING", "BOOTING", "INSTALLING", "STARTING", "RUNNING"] } } }),
      prisma.session.count({ where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } } }),
      prisma.computeHost.findMany(),
      prisma.emulatorInstance.count({ where: { status: { in: ["PROVISIONING", "BOOTING", "READY", "BUSY"] } } }),
    ]);

    return {
      users,
      organizations,
      activeSessions,
      failedSessionsLast24h: failedSessions,
      emulatorInstances,
      computeHosts: computeHosts.map((h) => ({
        id: h.id,
        name: h.name,
        status: h.status,
        providerType: h.providerType,
        cpuUsagePercent: h.cpuUsagePercent,
        ramUsagePercent: h.ramUsagePercent,
        maxConcurrentEmulators: h.maxConcurrentEmulators,
      })),
    };
  });

  app.get("/api/admin/users", async (req) => {
    const query = paginationQuerySchema.parse(req.query);
    const [items, total] = await Promise.all([
      prisma.user.findMany({ orderBy: { createdAt: "desc" }, skip: offsetFor(query), take: query.pageSize }),
      prisma.user.count(),
    ]);
    return paginate(items, total, query);
  });

  app.get("/api/admin/organizations", async (req) => {
    const query = paginationQuerySchema.parse(req.query);
    const [items, total] = await Promise.all([
      prisma.organization.findMany({
        orderBy: { createdAt: "desc" },
        skip: offsetFor(query),
        take: query.pageSize,
        include: { subscription: true, _count: { select: { members: true, projects: true } } },
      }),
      prisma.organization.count(),
    ]);
    return paginate(items, total, query);
  });

  app.get("/api/admin/sessions", async (req) => {
    const query = paginationQuerySchema.parse(req.query);
    const { status } = req.query as { status?: string };
    const where = { status: (status as never) || undefined };
    const [items, total] = await Promise.all([
      prisma.session.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offsetFor(query),
        take: query.pageSize,
        include: { organization: true, app: true, deviceProfile: true, user: { select: { email: true, name: true } } },
      }),
      prisma.session.count({ where }),
    ]);
    return paginate(items, total, query);
  });

  app.post("/api/admin/sessions/:id/force-stop", async (req) => {
    const { id } = req.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) throw new NotFoundError("Session");
    await sessionCleanupQueue().add("cleanup", { sessionId: id, reason: "admin" }, { removeOnComplete: true });
    return { ok: true };
  });

  app.get("/api/admin/compute-hosts", async () => {
    const hosts = await prisma.computeHost.findMany({ orderBy: { createdAt: "desc" } });
    return { hosts };
  });

  app.post("/api/admin/compute-hosts", async (req, reply) => {
    const input = createHostSchema.parse(req.body);
    const host = await prisma.computeHost.create({
      data: {
        name: input.name,
        providerType: input.providerType,
        hostname: input.hostname,
        region: input.region,
        cpuCapacityMillicores: input.cpuCapacityMillicores,
        ramCapacityMb: input.ramCapacityMb,
        diskCapacityMb: input.diskCapacityMb,
        gpuAvailable: input.gpuAvailable,
        kvmEnabled: input.kvmEnabled,
        maxConcurrentEmulators: input.maxConcurrentEmulators,
        status: "MAINTENANCE",
        metadata: { workerPort: input.workerPort },
      },
    });
    return reply.code(201).send({ host });
  });

  app.patch("/api/admin/compute-hosts/:id", async (req) => {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: "HEALTHY" | "DEGRADED" | "OFFLINE" | "MAINTENANCE" };
    const host = await prisma.computeHost.update({ where: { id }, data: { status } });
    return { host };
  });

  app.delete("/api/admin/compute-hosts/:id", async (req) => {
    const { id } = req.params as { id: string };
    await prisma.computeHost.delete({ where: { id } });
    return { ok: true };
  });

  app.patch("/api/admin/device-profiles/:id", async (req) => {
    const { id } = req.params as { id: string };
    const { isEnabled } = req.body as { isEnabled: boolean };
    const profile = await prisma.deviceProfile.update({ where: { id }, data: { isEnabled } });
    return { profile };
  });

  app.get("/api/admin/audit-logs", async (req) => {
    const query = paginationQuerySchema.parse(req.query);
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: offsetFor(query), take: query.pageSize }),
      prisma.auditLog.count(),
    ]);
    return paginate(items, total, query);
  });
}
