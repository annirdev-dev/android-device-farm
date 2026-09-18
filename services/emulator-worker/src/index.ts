import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { loadEnv } from "@devicefarm/config";
import { instancesRoutes } from "./routes/instances";
import { streamRoutes } from "./routes/stream";
import { getEmulatorProvider } from "./providers";

async function main() {
  const env = loadEnv();

  // Fail fast and loud rather than silently mocking hardware in prod.
  const provider = getEmulatorProvider();

  const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });
  await app.register(websocket);
  await app.register(instancesRoutes);
  await app.register(streamRoutes);

  const port = Number(process.env.EMULATOR_WORKER_PORT ?? 4200);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`emulator-worker listening on :${port} (provider=${provider.kind}, env=${env.NODE_ENV})`);
}

main().catch((err) => {
  console.error("emulator-worker failed to start:", err);
  process.exit(1);
});
