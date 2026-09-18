import type { ComputeHost } from "@devicefarm/database";

/** Same contract as device-orchestrator's compute-providers: read the persisted worker address off the host row. */
export function resolveWorkerBaseUrl(host: ComputeHost): string | undefined {
  const metadata = (host.metadata as Record<string, unknown> | null) ?? {};
  if (typeof metadata.workerBaseUrl === "string") return metadata.workerBaseUrl;
  if (host.providerType === "LOCAL") {
    const port = typeof metadata.workerPort === "number" ? metadata.workerPort : 4200;
    return `http://${host.hostname}:${port}`;
  }
  return undefined;
}
