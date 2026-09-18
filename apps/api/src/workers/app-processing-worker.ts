import { Worker } from "bullmq";
import { prisma } from "@devicefarm/database";
import { BUCKETS, downloadObject } from "@devicefarm/storage";
import { QUEUE_NAMES, type ProcessAppVersionJobData } from "@devicefarm/shared";
import { getMalwareScanner } from "../lib/malware-scan";
import { redisConnection } from "../lib/queues";

/** Runs malware scanning after upload; kept out of the request/response cycle so a slow scanner never blocks the upload UI. */
export function startAppProcessingWorker(): Worker<ProcessAppVersionJobData> {
  return new Worker<ProcessAppVersionJobData>(
    QUEUE_NAMES.APP_PROCESSING,
    async (job) => {
      const version = await prisma.appVersion.findUniqueOrThrow({ where: { id: job.data.appVersionId } });
      try {
        const buffer = await downloadObject(BUCKETS.apps, version.storageKey);
        const scanner = getMalwareScanner();
        const result = await scanner.scan(buffer);

        await prisma.appVersion.update({
          where: { id: version.id },
          data: {
            status: result.clean ? "READY" : "REJECTED",
            statusMessage: result.clean ? undefined : `Malware scan flagged this file: ${result.signature ?? "unknown signature"}`,
            scanResult: result as unknown as object,
          },
        });
      } catch (err) {
        await prisma.appVersion.update({
          where: { id: version.id },
          data: { status: "FAILED", statusMessage: (err as Error).message },
        });
        throw err;
      }
    },
    { connection: redisConnection(), concurrency: 3 },
  );
}
