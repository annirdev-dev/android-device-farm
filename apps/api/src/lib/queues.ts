import { Queue } from "bullmq";
import IORedis from "ioredis";
import { loadEnv } from "@devicefarm/config";
import {
  QUEUE_NAMES,
  type CreateSessionJobData,
  type DestroySessionJobData,
  type ProcessAppVersionJobData,
} from "@devicefarm/shared";

let connection: IORedis | undefined;
function redis(): IORedis {
  if (!connection) connection = new IORedis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null });
  return connection;
}

export const sessionLifecycleQueue = () => new Queue<CreateSessionJobData>(QUEUE_NAMES.SESSION_LIFECYCLE, { connection: redis() });
export const sessionCleanupQueue = () => new Queue<DestroySessionJobData>(QUEUE_NAMES.SESSION_CLEANUP, { connection: redis() });
export const appProcessingQueue = () => new Queue<ProcessAppVersionJobData>(QUEUE_NAMES.APP_PROCESSING, { connection: redis() });

export function redisConnection(): IORedis {
  return redis();
}
