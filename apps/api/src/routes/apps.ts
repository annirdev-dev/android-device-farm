import type { FastifyInstance } from "fastify";
import { prisma } from "@devicefarm/database";
import { NotFoundError } from "@devicefarm/shared";
import { authenticate, requireOrgMembership } from "../auth/middleware";

export async function appsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/api/apps", async (req) => {
    const { projectId } = req.query as { projectId: string };
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundError("Project");
    await requireOrgMembership(req, project.organizationId);

    const apps = await prisma.app.findMany({
      where: { projectId, deletedAt: null },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
    // Prisma's BigInt (fileSizeBytes) isn't JSON-serializable - stringify it,
    // same as the /app-versions routes already do.
    return { apps: apps.map((a) => ({ ...a, versions: a.versions.map((v) => ({ ...v, fileSizeBytes: v.fileSizeBytes.toString() })) })) };
  });

  app.get("/api/apps/:id", async (req) => {
    const { id } = req.params as { id: string };
    const appRow = await prisma.app.findUnique({
      where: { id },
      include: { project: true, versions: { orderBy: { createdAt: "desc" } } },
    });
    if (!appRow || appRow.deletedAt) throw new NotFoundError("App");
    await requireOrgMembership(req, appRow.project.organizationId);
    return { app: { ...appRow, versions: appRow.versions.map((v) => ({ ...v, fileSizeBytes: v.fileSizeBytes.toString() })) } };
  });

  app.delete("/api/apps/:id", async (req) => {
    const { id } = req.params as { id: string };
    const appRow = await prisma.app.findUnique({ where: { id }, include: { project: true } });
    if (!appRow) throw new NotFoundError("App");
    await requireOrgMembership(req, appRow.project.organizationId, ["OWNER", "ADMIN"]);
    await prisma.app.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}
