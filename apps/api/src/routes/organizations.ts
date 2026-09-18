import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@devicefarm/database";
import { NotFoundError, PLAN_DEFINITIONS } from "@devicefarm/shared";
import { authenticate, requireOrgMembership } from "../auth/middleware";
import { userOrgIds } from "../lib/tenant";

const createOrgSchema = z.object({ name: z.string().min(1).max(120) });
const inviteMemberSchema = z.object({ email: z.string().email(), role: z.enum(["OWNER", "ADMIN", "MEMBER", "BILLING"]).default("MEMBER") });

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function organizationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/api/organizations", async (req) => {
    const orgIds = await userOrgIds(req.user!.userId);
    const orgs = await prisma.organization.findMany({
      where: { id: { in: orgIds }, deletedAt: null },
      include: { subscription: true, _count: { select: { projects: true, members: true } } },
    });
    return { organizations: orgs };
  });

  app.post("/api/organizations", async (req, reply) => {
    const input = createOrgSchema.parse(req.body);
    let slug = slugify(input.name);
    while (await prisma.organization.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

    const org = await prisma.organization.create({ data: { name: input.name, slug } });
    await prisma.organizationMember.create({ data: { organizationId: org.id, userId: req.user!.userId, role: "OWNER" } });
    await prisma.subscription.create({
      data: { organizationId: org.id, plan: "FREE", deviceMinutesLimit: PLAN_DEFINITIONS.FREE.deviceMinutesPerMonth!, currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) },
    });
    return reply.code(201).send({ organization: org });
  });

  app.get("/api/organizations/:id", async (req) => {
    await requireOrgMembership(req, (req.params as { id: string }).id);
    const org = await prisma.organization.findUnique({
      where: { id: (req.params as { id: string }).id },
      include: { subscription: true, members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } } },
    });
    if (!org) throw new NotFoundError("Organization");
    return { organization: org };
  });

  app.post("/api/organizations/:id/members", async (req, reply) => {
    const { id } = req.params as { id: string };
    await requireOrgMembership(req, id, ["OWNER", "ADMIN"]);
    const input = inviteMemberSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      // MVP: require the invitee to already have an account. A full invite flow
      // (magic-link signup) is a documented follow-up, not faked here.
      return reply.code(404).send({ error: "USER_NOT_FOUND", message: "Ask them to create an account first, then invite them again" });
    }

    const member = await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: id, userId: user.id } },
      update: { role: input.role },
      create: { organizationId: id, userId: user.id, role: input.role },
    });
    return reply.code(201).send({ member });
  });

  app.delete("/api/organizations/:id/members/:userId", async (req) => {
    const { id, userId } = req.params as { id: string; userId: string };
    await requireOrgMembership(req, id, ["OWNER", "ADMIN"]);
    await prisma.organizationMember.delete({ where: { organizationId_userId: { organizationId: id, userId } } });
    return { ok: true };
  });
}
