import type { FastifyInstance } from "fastify";
import { prisma } from "@devicefarm/database";
import { PLAN_DEFINITIONS } from "@devicefarm/shared";
import { authenticate, requireOrgMembership } from "../auth/middleware";

export async function usageRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/api/usage", async (req) => {
    const { organizationId } = req.query as { organizationId: string };
    await requireOrgMembership(req, organizationId);

    const subscription = await prisma.subscription.findUnique({ where: { organizationId } });
    const plan = PLAN_DEFINITIONS[subscription?.plan ?? "FREE"];

    const periodStart = subscription?.currentPeriodStart ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const usageByMetric = await prisma.usage.groupBy({
      by: ["metricType"],
      where: { organizationId, periodStart: { gte: periodStart } },
      _sum: { quantity: true },
    });

    const sessionCount = await prisma.session.count({ where: { organizationId, createdAt: { gte: periodStart } } });

    return {
      plan,
      subscription,
      usage: Object.fromEntries(usageByMetric.map((u) => [u.metricType, Number(u._sum.quantity ?? 0)])),
      sessionCount,
    };
  });
}
