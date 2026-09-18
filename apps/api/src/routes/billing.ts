import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@devicefarm/database";
import { PLAN_DEFINITIONS } from "@devicefarm/shared";
import { authenticate, requireOrgMembership } from "../auth/middleware";
import { getBillingProvider } from "../lib/billing-provider";

const upgradeSchema = z.object({ plan: z.enum(["FREE", "PRO", "BUSINESS", "ENTERPRISE"]) });

export async function billingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/api/billing/plans", async () => ({ plans: Object.values(PLAN_DEFINITIONS) }));

  app.get("/api/billing/:organizationId", async (req) => {
    const { organizationId } = req.params as { organizationId: string };
    await requireOrgMembership(req, organizationId);
    const subscription = await prisma.subscription.findUnique({ where: { organizationId } });
    return { subscription, billingConfigured: getBillingProvider().configured };
  });

  app.post("/api/billing/:organizationId/checkout", async (req, reply) => {
    const { organizationId } = req.params as { organizationId: string };
    await requireOrgMembership(req, organizationId, ["OWNER", "BILLING"]);
    const { plan } = upgradeSchema.parse(req.body);

    if (plan === "FREE") {
      await prisma.subscription.update({
        where: { organizationId },
        data: { plan: "FREE", deviceMinutesLimit: PLAN_DEFINITIONS.FREE.deviceMinutesPerMonth! },
      });
      return { downgraded: true };
    }

    const provider = getBillingProvider();
    if (!provider.configured) {
      return reply.code(501).send({ error: "BILLING_NOT_CONFIGURED", message: "Set STRIPE_SECRET_KEY to enable paid plan checkout" });
    }
    const session = await provider.createCheckoutSession(
      organizationId,
      plan,
      `${process.env.WEB_PUBLIC_URL}/billing?success=1`,
      `${process.env.WEB_PUBLIC_URL}/billing?canceled=1`,
    );
    return { checkoutUrl: session.url };
  });
}
