import { prisma } from "@devicefarm/database";

/** All organization IDs a user belongs to - the scoping filter for every "list my stuff" query. */
export async function userOrgIds(userId: string): Promise<string[]> {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true },
  });
  return memberships.map((m) => m.organizationId);
}
