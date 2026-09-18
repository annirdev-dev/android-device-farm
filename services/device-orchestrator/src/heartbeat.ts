import { prisma } from "@devicefarm/database";
import { computeProviderFor } from "./compute-providers";

/**
 * Polls every registered compute host's emulator-worker for live capacity
 * and marks it HEALTHY/DEGRADED/OFFLINE. This is what lets the scheduler
 * make decisions based on current, not stale, utilization, and is how the
 * Admin Dashboard's host health view stays accurate.
 */
export async function heartbeatComputeHosts(): Promise<void> {
  const hosts = await prisma.computeHost.findMany();

  await Promise.all(
    hosts.map(async (host) => {
      try {
        const client = computeProviderFor(host).client(host);
        const capacity = await client.capacity();
        await prisma.computeHost.update({
          where: { id: host.id },
          data: {
            cpuUsagePercent: capacity.cpuUsagePercent,
            ramUsagePercent: capacity.ramUsagePercent,
            status: "HEALTHY",
            lastHeartbeatAt: new Date(),
          },
        });
      } catch (err) {
        const staleFor = host.lastHeartbeatAt ? Date.now() - host.lastHeartbeatAt.getTime() : Infinity;
        await prisma.computeHost.update({
          where: { id: host.id },
          data: { status: staleFor > 5 * 60_000 ? "OFFLINE" : "DEGRADED" },
        });
        console.warn(`Heartbeat failed for host ${host.name}:`, (err as Error).message);
      }
    }),
  );
}

export function startHeartbeatLoop(): NodeJS.Timeout {
  return setInterval(() => {
    heartbeatComputeHosts().catch((err) => console.error("Heartbeat loop failed:", err));
  }, 20_000);
}
