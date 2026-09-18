import http from "node:http";
import client from "prom-client";

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const sessionStartDuration = new client.Histogram({
  name: "devicefarm_session_start_duration_seconds",
  help: "Time from job pickup to a session reaching RUNNING",
  buckets: [5, 10, 20, 30, 45, 60, 90, 120, 180, 300],
  registers: [registry],
});

export const emulatorBootDuration = new client.Histogram({
  name: "devicefarm_emulator_boot_duration_seconds",
  help: "Time for the worker's createInstance call to return (AVD create + emulator boot)",
  buckets: [5, 10, 20, 30, 45, 60, 90, 120, 180],
  registers: [registry],
});

export const sessionFailuresTotal = new client.Counter({
  name: "devicefarm_session_failures_total",
  help: "Session lifecycle failures",
  registers: [registry],
});

export const emulatorCrashesTotal = new client.Counter({
  name: "devicefarm_emulator_crashes_total",
  help: "Emulator instances that transitioned to CRASHED/FAILED",
  registers: [registry],
});

/** No web framework in this service - a bare http server is plenty for a single /metrics endpoint. */
export function startMetricsServer(port = 9464): void {
  http
    .createServer(async (req, res) => {
      if (req.url !== "/metrics") {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": registry.contentType });
      res.end(await registry.metrics());
    })
    .listen(port, () => console.log(`device-orchestrator metrics on :${port}/metrics`));
}
