import { prisma } from "@devicefarm/database";
import { sessionEventsChannel, type SessionProgressEvent, type SessionProgressStep } from "@devicefarm/shared";
import { redisConnection } from "./redis";

const PROGRESS_PERCENT: Record<SessionProgressStep, number> = {
  QUEUED: 5,
  SELECTING_HOST: 12,
  CREATING_INSTANCE: 25,
  ALLOCATING_RESOURCES: 35,
  BOOTING_ANDROID: 55,
  INSTALLING_APPLICATION: 75,
  STARTING_APPLICATION: 88,
  CONNECTING_STREAM: 95,
  READY: 100,
  FAILED: 100,
};

/** Persists a SessionEvent row (audit trail) and publishes it for the API's WebSocket layer to relay live. */
export async function emitProgress(sessionId: string, step: SessionProgressStep, message?: string): Promise<void> {
  const event: SessionProgressEvent = {
    sessionId,
    step,
    message,
    progressPercent: PROGRESS_PERCENT[step],
    timestamp: new Date().toISOString(),
  };

  await prisma.sessionEvent.create({
    data: {
      sessionId,
      type: step === "FAILED" ? "ERROR" : "PROGRESS",
      message: message ?? step,
      payload: event as unknown as object,
    },
  });

  await redisConnection().publish(sessionEventsChannel(sessionId), JSON.stringify(event));
}

export async function emitSystemEvent(sessionId: string, message: string, payload?: object): Promise<void> {
  await prisma.sessionEvent.create({
    data: { sessionId, type: "SYSTEM", message, payload: payload as object | undefined },
  });
  await redisConnection().publish(
    sessionEventsChannel(sessionId),
    JSON.stringify({ sessionId, type: "SYSTEM", message, timestamp: new Date().toISOString() }),
  );
}

export async function appendSessionLog(
  sessionId: string,
  source: "LOGCAT" | "APPLICATION" | "EMULATOR" | "SYSTEM" | "NETWORK" | "CRASH",
  level: "VERBOSE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL",
  message: string,
  tag?: string,
): Promise<void> {
  await prisma.log.create({ data: { sessionId, source, level, message, tag } });
}
