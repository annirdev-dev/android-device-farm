import { PrismaClient } from "../generated/client";

declare global {
  // eslint-disable-next-line no-var
  var __devicefarm_prisma__: PrismaClient | undefined;
}

// Reuse a single PrismaClient across hot reloads / module reloads so we never
// exhaust the Postgres connection pool in dev.
export const prisma =
  globalThis.__devicefarm_prisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__devicefarm_prisma__ = prisma;
}

export * from "../generated/client";
