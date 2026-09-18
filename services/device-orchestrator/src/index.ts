import { Worker, Queue } from "bullmq";
import { loadEnv } from "@devicefarm/config";
import { QUEUE_NAMES, type CreateSessionJobData, type DestroySessionJobData } from "@devicefarm/shared";
import { redisConnection } from "./redis";
import { runSessionLifecycle } from "./session-lifecycle";
import { runSessionCleanup } from "./session-cleanup";
import { startReaperLoop } from "./reaper";
import { startHeartbeatLoop } from "./heartbeat";
import { startMetricsServer } from "./metrics";

async function main() {
  loadEnv();
  const connection = redisConnection();

  const cleanupQueue = new Queue<DestroySessionJobData>(QUEUE_NAMES.SESSION_CLEANUP, { connection });

  const lifecycleWorker = new Worker<CreateSessionJobData>(
    QUEUE_NAMES.SESSION_LIFECYCLE,
    async (job) => runSessionLifecycle(job.data.sessionId),
    { connection, concurrency: 5 },
  );

  const cleanupWorker = new Worker<DestroySessionJobData>(
    QUEUE_NAMES.SESSION_CLEANUP,
    async (job) => runSessionCleanup(job.data),
    { connection, concurrency: 5 },
  );

  lifecycleWorker.on("failed", (job, err) => {
    console.error(`session-lifecycle job ${job?.id} failed:`, err.message);
  });
  cleanupWorker.on("failed", (job, err) => {
    console.error(`session-cleanup job ${job?.id} failed:`, err.message);
  });

  startReaperLoop(cleanupQueue);
  startHeartbeatLoop();
  startMetricsServer();

  console.log("device-orchestrator running: session-lifecycle + session-cleanup workers, reaper + heartbeat loops active");

  const shutdown = async () => {
    console.log("Shutting down device-orchestrator...");
    await Promise.all([lifecycleWorker.close(), cleanupWorker.close(), cleanupQueue.close()]);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("device-orchestrator failed to start:", err);
  process.exit(1);
});
