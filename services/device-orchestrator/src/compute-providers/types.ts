import type { ComputeHost } from "@devicefarm/database";
import { WorkerClient } from "../worker-client";

/**
 * Resolves *how to reach* the emulator-worker running on a given compute
 * host, and (for elastic providers) how to bring a worker online in the
 * first place. Selecting WHICH host to use is the Scheduler's job; this
 * layer only knows how to talk to whichever host it's handed.
 */
export interface ComputeProvider {
  readonly kind: "LOCAL" | "DOCKER" | "KUBERNETES" | "CLOUD";
  /** Ensures a worker is reachable for this host, starting one if the provider supports elastic hosts. */
  ensureHostReady(host: ComputeHost): Promise<void>;
  client(host: ComputeHost): WorkerClient;
}

export function workerPortFromMetadata(host: ComputeHost): number {
  const metadata = (host.metadata as Record<string, unknown> | null) ?? {};
  const port = metadata.workerPort;
  return typeof port === "number" ? port : 4200;
}

/**
 * Every provider persists the reachable base URL for its host's worker onto
 * `compute_hosts.metadata.workerBaseUrl` once provisioned, so any stateless
 * service (streaming-gateway, the API) can resolve it straight from the DB
 * without holding provider-specific in-memory state.
 */
export function resolveWorkerBaseUrl(host: ComputeHost): string | undefined {
  const metadata = (host.metadata as Record<string, unknown> | null) ?? {};
  if (typeof metadata.workerBaseUrl === "string") return metadata.workerBaseUrl;
  if (host.providerType === "LOCAL") return `http://${host.hostname}:${workerPortFromMetadata(host)}`;
  return undefined;
}
