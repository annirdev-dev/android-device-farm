import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma, type OrgRole } from "@devicefarm/database";
import { ForbiddenError, UnauthorizedError } from "@devicefarm/shared";
import { verifyToken } from "./jwt";

declare module "fastify" {
  interface FastifyRequest {
    user?: { userId: string; email: string; isPlatformAdmin: boolean };
  }
}

function extractToken(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return (req.cookies as Record<string, string> | undefined)?.token;
}

/** Fastify preHandler: rejects the request unless it carries a valid session JWT. */
export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    reply.code(401).send({ error: "UNAUTHORIZED", message: "Authentication required" });
    return reply;
  }
  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.deletedAt) throw new UnauthorizedError();
    req.user = { userId: user.id, email: user.email, isPlatformAdmin: user.isPlatformAdmin };
  } catch {
    reply.code(401).send({ error: "UNAUTHORIZED", message: "Invalid or expired session" });
    return reply;
  }
}

/** Optional auth: attaches req.user if present, but never rejects. Useful for public/semi-public routes. */
export async function optionalAuthenticate(req: FastifyRequest): Promise<void> {
  const token = extractToken(req);
  if (!token) return;
  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (user && !user.deletedAt) {
      req.user = { userId: user.id, email: user.email, isPlatformAdmin: user.isPlatformAdmin };
    }
  } catch {
    // ignore invalid token on optional routes
  }
}

/**
 * Tenant isolation gate: throws unless the authenticated user belongs to
 * `organizationId`, optionally requiring a minimum role. This is called at
 * the top of every route that takes an organizationId/projectId/etc, so a
 * user from Org A can never read or mutate Org B's rows even if they guess a
 * valid UUID.
 */
export async function requireOrgMembership(
  req: FastifyRequest,
  organizationId: string,
  minRoles?: OrgRole[],
): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  if (req.user.isPlatformAdmin) return;

  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: req.user.userId } },
  });
  if (!membership) throw new ForbiddenError("You are not a member of this organization");
  if (minRoles && !minRoles.includes(membership.role)) {
    throw new ForbiddenError(`This action requires one of: ${minRoles.join(", ")}`);
  }
}

export function requirePlatformAdmin(req: FastifyRequest): void {
  if (!req.user?.isPlatformAdmin) throw new ForbiddenError("Platform admin access required");
}
