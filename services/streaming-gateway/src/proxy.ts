import type { WebSocket as ClientWebSocket } from "ws";
import { WebSocket } from "ws";
import type { WebSocket as ServerWebSocket } from "ws";
import { prisma } from "@devicefarm/database";
import { resolveWorkerBaseUrl, toWsUrl } from "./worker-url";

export interface AuthorizedSession {
  sessionId: string;
  instanceId: string;
  upstreamBase: string;
}

/**
 * Confirms the caller holds the session's one-time streaming token and that
 * the session actually has a live instance before we ever open an upstream
 * connection. This is the tenant-isolation choke point for the video/control
 * channel: knowing a session UUID alone is never enough.
 */
export async function authorizeSessionStream(sessionId: string, token: string | undefined): Promise<AuthorizedSession> {
  if (!token) throw new Error("Missing streaming token");

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { emulatorInstance: { include: { computeHost: true } } },
  });

  if (!session || session.streamingToken !== token) {
    throw new Error("Invalid session or streaming token");
  }
  if (session.status !== "RUNNING" || !session.emulatorInstance) {
    throw new Error(`Session is not running (status=${session.status})`);
  }

  const base = resolveWorkerBaseUrl(session.emulatorInstance.computeHost);
  if (!base) throw new Error("Could not resolve a worker address for this session's compute host");

  return { sessionId, instanceId: session.emulatorInstance.id, upstreamBase: base };
}

/** Pipes a browser WebSocket to/from the emulator-worker's per-instance stream socket. */
export function proxyStream(client: ServerWebSocket, auth: AuthorizedSession, path: "stream" | "logcat"): void {
  const upstreamUrl = `${toWsUrl(auth.upstreamBase)}/instances/${auth.instanceId}/${path}`;
  const upstream: ClientWebSocket = new WebSocket(upstreamUrl);

  upstream.on("open", () => {
    client.on("message", (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data as Buffer, { binary: isBinary });
      if (!isBinary) touchActivity(auth.sessionId);
    });
  });

  upstream.on("message", (data, isBinary) => {
    if (client.readyState === client.OPEN) client.send(data as Buffer, { binary: isBinary });
    if (path === "logcat" && !isBinary) bufferLogLine(auth.sessionId, data.toString("utf8"));
  });

  upstream.on("close", () => client.close());
  upstream.on("error", (err) => {
    client.send(JSON.stringify({ type: "error", message: `Upstream error: ${err.message}` }));
    client.close();
  });

  const cleanup = () => {
    upstream.close();
    if (path === "logcat") {
      const timer = flushTimers.get(auth.sessionId);
      if (timer) {
        clearInterval(timer);
        flushTimers.delete(auth.sessionId);
      }
      flushLogBuffer(auth.sessionId);
    }
  };
  client.on("close", cleanup);
  client.on("error", cleanup);
}

const lastTouch = new Map<string, number>();
function touchActivity(sessionId: string): void {
  const now = Date.now();
  const last = lastTouch.get(sessionId) ?? 0;
  if (now - last < 5000) return; // throttle DB writes to at most once per 5s per session
  lastTouch.set(sessionId, now);
  prisma.session.update({ where: { id: sessionId }, data: { lastActivityAt: new Date() } }).catch(() => undefined);
}

interface WorkerLogLine {
  source: "LOGCAT" | "EMULATOR" | "SYSTEM" | "CRASH";
  level: "VERBOSE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
  tag?: string;
  message: string;
}

// Batches logcat lines and flushes to Postgres every 2s per session, rather
// than one INSERT per line, so a chatty app can't turn log streaming into a
// write-amplification problem.
const logBuffers = new Map<string, WorkerLogLine[]>();
const flushTimers = new Map<string, ReturnType<typeof setInterval>>();

function bufferLogLine(sessionId: string, raw: string): void {
  let parsed: WorkerLogLine;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const buffer = logBuffers.get(sessionId) ?? [];
  buffer.push(parsed);
  logBuffers.set(sessionId, buffer);

  if (!flushTimers.has(sessionId)) {
    flushTimers.set(
      sessionId,
      setInterval(() => flushLogBuffer(sessionId), 2000),
    );
  }
}

async function flushLogBuffer(sessionId: string): Promise<void> {
  const buffer = logBuffers.get(sessionId);
  if (!buffer || buffer.length === 0) return;
  logBuffers.set(sessionId, []);
  await prisma.log
    .createMany({
      data: buffer.map((line) => ({
        sessionId,
        source: line.source,
        level: line.level,
        tag: line.tag,
        message: line.message,
      })),
    })
    .catch(() => undefined);
}
