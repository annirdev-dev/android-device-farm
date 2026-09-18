import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { instanceManager } from "../instance-manager";
import { getEmulatorProvider } from "../providers";
import {
  keyInputSchema,
  swipeInputSchema,
  textInputSchema,
  touchInputSchema,
} from "@devicefarm/shared";

const FRAME_INTERVAL_MS = 150; // ~6-7 fps; a real WebRTC/H.264 gateway replaces this poll loop later.

/**
 * Per-instance duplex channel: server pushes JPEG/SVG frames as binary
 * messages, client pushes JSON input commands. This is the v1 transport the
 * streaming-gateway proxies to; swapping it for WebRTC only requires
 * replacing this file plus the gateway's proxy, never the providers.
 */
export async function streamRoutes(app: FastifyInstance) {
  app.get("/instances/:id/stream", { websocket: true }, (connection, req) => {
    const { id } = req.params as { id: string };
    const socket = connection as unknown as WebSocket;

    if (!instanceManager.get(id)) {
      socket.close(4404, "instance_not_found");
      return;
    }

    let closed = false;
    const frameTimer = setInterval(async () => {
      if (closed || socket.readyState !== socket.OPEN) return;
      try {
        const frame = await instanceManager.captureFrame(id);
        socket.send(frame);
      } catch {
        // Transient capture failures are expected during boot/reset; skip the frame.
      }
    }, FRAME_INTERVAL_MS);

    socket.on("message", async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString("utf8"));
        const provider = getEmulatorProvider();
        const handle = instanceManager.handleOf(id);
        switch (msg.type) {
          case "touch":
            await provider.sendTouch(handle, touchInputSchema.parse(msg.payload));
            break;
          case "swipe":
            await provider.sendSwipe(handle, swipeInputSchema.parse(msg.payload));
            break;
          case "key":
            await provider.sendKey(handle, keyInputSchema.parse(msg.payload).keyCode);
            break;
          case "text":
            await provider.sendText(handle, textInputSchema.parse(msg.payload).text);
            break;
          default:
            socket.send(JSON.stringify({ type: "error", message: `Unknown input type: ${msg.type}` }));
        }
      } catch (err) {
        socket.send(JSON.stringify({ type: "error", message: (err as Error).message }));
      }
    });

    socket.on("close", () => {
      closed = true;
      clearInterval(frameTimer);
    });
  });

  app.get("/instances/:id/logcat", { websocket: true }, (connection, req) => {
    const { id } = req.params as { id: string };
    const socket = connection as unknown as WebSocket;

    if (!instanceManager.get(id)) {
      socket.close(4404, "instance_not_found");
      return;
    }

    const unsubscribe = instanceManager.subscribeLogs(id, (line) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(line));
      }
    });

    socket.on("close", unsubscribe);
  });
}
