import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import IORedis from "ioredis";
import { prisma } from "@devicefarm/database";
import { loadEnv } from "@devicefarm/config";
import { sessionEventsChannel } from "@devicefarm/shared";
import { verifyToken } from "../auth/jwt";
import { userOrgIds } from "../lib/tenant";

/**
 * Live progress feed for the "Start Device" panel (QUEUED -> ... -> READY).
 * Separate from the streaming-gateway's video/control socket: this one only
 * ever carries small JSON progress events sourced from Redis pub/sub, so the
 * device-orchestrator (in a different process, possibly a different host)
 * can push updates without ever knowing the API's websocket internals.
 */
export async function sessionEventsWsRoute(app: FastifyInstance) {
  app.get("/ws/sessions/:id/events", { websocket: true }, async (connection, req) => {
    const socket = connection as unknown as WebSocket;
    const { id } = req.params as { id: string };
    // The WS upgrade request is a normal HTTP request, so the httpOnly
    // session cookie rides along with it; fall back to a ?token= query param
    // for non-browser clients that can't rely on cookies.
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.token;
    const queryToken = (req.query as { token?: string }).token;
    const token = cookieToken ?? queryToken;

    try {
      if (!token) throw new Error("Missing auth token");
      const payload = verifyToken(token);
      const session = await prisma.session.findUnique({ where: { id } });
      if (!session) throw new Error("Session not found");
      const orgIds = await userOrgIds(payload.userId);
      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user?.isPlatformAdmin && !orgIds.includes(session.organizationId)) throw new Error("Forbidden");

      socket.send(JSON.stringify({ type: "snapshot", status: session.status, errorMessage: session.errorMessage }));
    } catch (err) {
      socket.send(JSON.stringify({ type: "error", message: (err as Error).message }));
      socket.close(4401, "unauthorized");
      return;
    }

    const subscriber = new IORedis(loadEnv().REDIS_URL);
    const channel = sessionEventsChannel(id);
    await subscriber.subscribe(channel);
    subscriber.on("message", (_chan, message) => {
      if (socket.readyState === socket.OPEN) socket.send(message);
    });

    socket.on("close", () => {
      subscriber.unsubscribe(channel).catch(() => undefined);
      subscriber.quit().catch(() => undefined);
    });
  });
}
