import { Queue } from "bullmq";
import { prisma } from "@devicefarm/database";
import { loadEnv } from "@devicefarm/config";
import type { DestroySessionJobData } from "@devicefarm/shared";

/**
 * Runs on an interval (see index.ts) and enqueues cleanup for any session
 * that's either been idle past SESSION_ABANDONED_TIMEOUT_MINUTES (browser
 * tab closed without clicking "Stop") or has exceeded
 * SESSION_MAX_DURATION_MINUTES (hard cap so a stuck session can't run/bill
 * forever).
 */
export async function reapAbandonedSessions(cleanupQueue: Queue<DestroySessionJobData>): Promise<number> {
  const env = loadEnv();
  const now = Date.now();
  const abandonedCutoff = new Date(now - env.SESSION_ABANDONED_TIMEOUT_MINUTES * 60_000);
  const maxDurationCutoff = new Date(now - env.SESSION_MAX_DURATION_MINUTES * 60_000);

  const candidates = await prisma.session.findMany({
    where: {
      status: { in: ["RUNNING", "CREATING", "BOOTING", "INSTALLING", "STARTING"] },
      OR: [{ lastActivityAt: { lt: abandonedCutoff } }, { createdAt: { lt: maxDurationCutoff } }],
    },
    select: { id: true, lastActivityAt: true, createdAt: true },
  });

  for (const session of candidates) {
    await cleanupQueue.add(
      "cleanup",
      { sessionId: session.id, reason: "abandoned" } satisfies DestroySessionJobData,
      { removeOnComplete: true, removeOnFail: 50 },
    );
  }

  return candidates.length;
}

export function startReaperLoop(cleanupQueue: Queue<DestroySessionJobData>): NodeJS.Timeout {
  return setInterval(() => {
    reapAbandonedSessions(cleanupQueue).catch((err) => console.error("Reaper loop failed:", err));
  }, 60_000);
}
