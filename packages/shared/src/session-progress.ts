/**
 * Canonical progress steps shown to the user between clicking "Start Device"
 * and the session becoming interactive. `SessionStatus` (persisted) is
 * coarser than this; `SessionProgressStep` is the fine-grained UI signal
 * emitted over the session-events WebSocket channel.
 */
export const SESSION_PROGRESS_STEPS = [
  "QUEUED",
  "SELECTING_HOST",
  "CREATING_INSTANCE",
  "ALLOCATING_RESOURCES",
  "BOOTING_ANDROID",
  "INSTALLING_APPLICATION",
  "STARTING_APPLICATION",
  "CONNECTING_STREAM",
  "READY",
  "FAILED",
] as const;

export type SessionProgressStep = (typeof SESSION_PROGRESS_STEPS)[number];

export const SESSION_PROGRESS_LABELS: Record<SessionProgressStep, string> = {
  QUEUED: "Queued",
  SELECTING_HOST: "Selecting compute host",
  CREATING_INSTANCE: "Creating instance",
  ALLOCATING_RESOURCES: "Allocating resources",
  BOOTING_ANDROID: "Booting Android",
  INSTALLING_APPLICATION: "Installing application",
  STARTING_APPLICATION: "Starting application",
  CONNECTING_STREAM: "Connecting stream",
  READY: "Ready",
  FAILED: "Failed",
};

export interface SessionProgressEvent {
  sessionId: string;
  step: SessionProgressStep;
  message?: string;
  progressPercent: number;
  timestamp: string;
}
