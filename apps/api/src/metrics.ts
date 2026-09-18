import client from "prom-client";
import { prisma } from "@devicefarm/database";

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new client.Histogram({
  name: "devicefarm_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});

export const activeSessionsGauge = new client.Gauge({
  name: "devicefarm_active_sessions",
  help: "Sessions currently in a non-terminal state",
  registers: [registry],
});

export const failedSessions24hGauge = new client.Gauge({
  name: "devicefarm_failed_sessions_24h",
  help: "Sessions that failed in the last 24 hours",
  registers: [registry],
});

export const computeHostUtilization = new client.Gauge({
  name: "devicefarm_compute_host_utilization_percent",
  help: "Per-host CPU/RAM utilization as reported by the last heartbeat",
  labelNames: ["host", "resource"],
  registers: [registry],
});

/** Refreshes the gauges from Postgres right before each /metrics scrape - simpler than a background poller for an MVP's scrape interval. */
export async function refreshGaugesFromDb(): Promise<void> {
  const [active, failed, hosts] = await Promise.all([
    prisma.session.count({ where: { status: { in: ["CREATING", "BOOTING", "INSTALLING", "STARTING", "RUNNING"] } } }),
    prisma.session.count({ where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } } }),
    prisma.computeHost.findMany(),
  ]);
  activeSessionsGauge.set(active);
  failedSessions24hGauge.set(failed);
  for (const host of hosts) {
    computeHostUtilization.set({ host: host.name, resource: "cpu" }, host.cpuUsagePercent);
    computeHostUtilization.set({ host: host.name, resource: "ram" }, host.ramUsagePercent);
  }
}
