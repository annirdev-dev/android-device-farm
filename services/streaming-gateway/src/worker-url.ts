import type { ComputeHost } from "@devicefarm/database";

/**
 * Mirrors device-orchestrator's compute-providers `resolveWorkerBaseUrl`.
 * Kept as a small standalone copy (rather than a cross-service import) so
 * the streaming-gateway never needs to depend on orchestrator internals -
 * both simply read the same `compute_hosts.metadata.workerBaseUrl` contract.
 */
export function resolveWorkerBaseUrl(host: ComputeHost): string | undefined {
  const metadata = (host.metadata as Record<string, unknown> | null) ?? {};
  if (typeof metadata.workerBaseUrl === "string") return metadata.workerBaseUrl;
  if (host.providerType === "LOCAL") {
    const port = typeof metadata.workerPort === "number" ? metadata.workerPort : 4200;
    return `http://${host.hostname}:${port}`;
  }
  return undefined;
}

export function toWsUrl(httpBaseUrl: string): string {
  return httpBaseUrl.replace(/^http/, "ws");
}
