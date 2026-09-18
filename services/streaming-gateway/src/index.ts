import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { loadEnv } from "@devicefarm/config";
import { authorizeSessionStream, proxyStream } from "./proxy";

async function main() {
  const env = loadEnv();
  const app = Fastify({ logger: true });
  await app.register(websocket);

  app.get("/health", async () => ({ ok: true }));

  async function handleUpgrade(path: "stream" | "logcat", connection: unknown, req: unknown) {
    const socket = connection as import("ws").WebSocket;
    const { sessionId } = (req as { params: { sessionId: string } }).params;
    const { token } = (req as { query: { token?: string } }).query;
    try {
      const auth = await authorizeSessionStream(sessionId, token);
      proxyStream(socket, auth, path);
    } catch (err) {
      socket.send(JSON.stringify({ type: "error", message: (err as Error).message }));
      socket.close(4401, "unauthorized");
    }
  }

  app.get("/sessions/:sessionId/stream", { websocket: true }, (connection, req) =>
    handleUpgrade("stream", connection, req),
  );
  app.get("/sessions/:sessionId/logcat", { websocket: true }, (connection, req) =>
    handleUpgrade("logcat", connection, req),
  );

  await app.listen({ port: env.STREAMING_GATEWAY_PORT, host: "0.0.0.0" });
  app.log.info(`streaming-gateway listening on :${env.STREAMING_GATEWAY_PORT}`);
}

main().catch((err) => {
  console.error("streaming-gateway failed to start:", err);
  process.exit(1);
});
