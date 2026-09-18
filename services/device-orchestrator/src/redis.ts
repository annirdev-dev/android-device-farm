import IORedis from "ioredis";
import { loadEnv } from "@devicefarm/config";

let connection: IORedis | undefined;

/** BullMQ requires maxRetriesPerRequest: null on the connection it owns. */
export function redisConnection(): IORedis {
  if (connection) return connection;
  connection = new IORedis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null });
  return connection;
}
