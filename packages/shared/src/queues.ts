/**
 * Names of the BullMQ queues shared between the API, the device-orchestrator,
 * and the emulator-worker. Keeping them in one place avoids typo drift across
 * services that only ever talk to each other through Redis.
 */
export const QUEUE_NAMES = {
  SESSION_LIFECYCLE: "session-lifecycle",
  SESSION_CLEANUP: "session-cleanup",
  HOST_HEARTBEAT: "host-heartbeat",
  APP_PROCESSING: "app-processing",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Redis pub/sub channel that carries live session progress to the API's WS layer. */
export const SESSION_EVENTS_CHANNEL_PREFIX = "session-events:";

export function sessionEventsChannel(sessionId: string): string {
  return `${SESSION_EVENTS_CHANNEL_PREFIX}${sessionId}`;
}

/** Job payload for creating a new session end-to-end. */
export interface CreateSessionJobData {
  sessionId: string;
}

export interface DestroySessionJobData {
  sessionId: string;
  reason: "user_requested" | "abandoned" | "admin" | "failed" | "restart";
}

export interface ProcessAppVersionJobData {
  appVersionId: string;
}
