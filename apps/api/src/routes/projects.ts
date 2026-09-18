import type { FastifyInstance } from "fastify";
import { prisma } from "@devicefarm/database";
import { createProjectSchema, NotFoundError } from "@devicefarm/shared";
import { authenticate, requireOrgMembership } from "../auth/middleware";
import { userOrgIds } from "../lib/tenant";

export async function projectRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/api/projects", async (req) => {
    const orgIds = await userOrgIds(req.user!.userId);
    const { organizationId } = req.query as { organizationId?: string };
    const projects = await prisma.project.findMany({
      where: {
        deletedAt: null,
        organizationId: organizationId ? organizationId : { in: orgIds },
      },
      include: { _count: { select: { apps: true, sessions: true } } },
      orderBy: { createdAt: "desc" },
    });
    // Defense in depth: if an explicit organizationId was passed, still enforce membership.
    if (organizationId) await requireOrgMembership(req, organizationId);
    return { projects };
  });

  app.post("/api/projects", async (req, reply) => {
    const body = req.body as { organizationId: string } & Record<string, unknown>;
    await requireOrgMembership(req, body.organizationId, ["OWNER", "ADMIN", "MEMBER"]);
    const input = createProjectSchema.parse(body);
    const project = await prisma.project.create({
      data: { organizationId: body.organizationId, name: input.name, slug: input.slug, description: input.description },
    });
    return reply.code(201).send({ project });
  });

  app.get("/api/projects/:id", async (req) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findUnique({ where: { id }, include: { apps: true } });
    if (!project || project.deletedAt) throw new NotFoundError("Project");
    await requireOrgMembership(req, project.organizationId);
    return { project };
  });

  app.delete("/api/projects/:id", async (req) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundError("Project");
    await requireOrgMembership(req, project.organizationId, ["OWNER", "ADMIN"]);
    await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}
