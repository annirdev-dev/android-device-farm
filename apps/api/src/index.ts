import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { loadEnv } from "@devicefarm/config";
import { ensureBucketsExist } from "@devicefarm/storage";
import { registerErrorHandler } from "./plugins/error-handler";
import { authRoutes } from "./routes/auth";
import { organizationRoutes } from "./routes/organizations";
import { projectRoutes } from "./routes/projects";
import { appsRoutes } from "./routes/apps";
import { appVersionRoutes } from "./routes/app-versions";
import { deviceProfileRoutes } from "./routes/device-profiles";
import { devicesRoutes } from "./routes/devices";
import { sessionsRoutes } from "./routes/sessions";
import { recordingsRoutes } from "./routes/recordings";
import { usageRoutes } from "./routes/usage";
import { billingRoutes } from "./routes/billing";
import { adminRoutes } from "./routes/admin";
import { sessionEventsWsRoute } from "./routes/ws-session-events";
import { startAppProcessingWorker } from "./workers/app-processing-worker";
import { httpRequestDuration, refreshGaugesFromDb, registry } from "./metrics";

async function main() {
  const env = loadEnv();
  await ensureBucketsExist();

  const app = Fastify({ logger: true, trustProxy: true });

  await app.register(cors, { origin: env.WEB_PUBLIC_URL, credentials: true });
  await app.register(cookie);
  await app.register(websocket);
  await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } });
  await app.register(rateLimit, { max: env.RATE_LIMIT_MAX, timeWindow: env.RATE_LIMIT_WINDOW_MS });

  registerErrorHandler(app);

  app.get("/health", async () => ({ ok: true, env: env.NODE_ENV }));

  // Prometheus scrape target. Intentionally unauthenticated (standard
  // practice) - keep this port reachable only from your internal network /
  // Prometheus scraper, not the public internet, in production.
  app.get("/metrics", async (_req, reply) => {
    await refreshGaugesFromDb().catch(() => undefined);
    reply.header("content-type", registry.contentType);
    return registry.metrics();
  });

  app.addHook("onResponse", (req, reply, done) => {
    httpRequestDuration.observe(
      { method: req.method, route: req.routerPath ?? req.url, status_code: String(reply.statusCode) },
      reply.elapsedTime / 1000,
    );
    done();
  });

  await app.register(authRoutes);
  await app.register(organizationRoutes);
  await app.register(projectRoutes);
  await app.register(appsRoutes);
  await app.register(appVersionRoutes);
  await app.register(deviceProfileRoutes);
  await app.register(devicesRoutes);
  await app.register(sessionsRoutes);
  await app.register(recordingsRoutes);
  await app.register(usageRoutes);
  await app.register(billingRoutes);
  await app.register(adminRoutes);
  await app.register(sessionEventsWsRoute);

  const appProcessingWorker = startAppProcessingWorker();

  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  app.log.info(`api listening on :${env.API_PORT}`);

  const shutdown = async () => {
    await Promise.all([app.close(), appProcessingWorker.close()]);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("api failed to start:", err);
  process.exit(1);
});
