import type { ComputeHost } from "@devicefarm/database";
import type { WorkerClient } from "../worker-client";
import type { ComputeProvider } from "./types";

/**
 * TODO(cloud): provision a bare-metal or nested-virtualization-capable
 * instance (e.g. AWS `.metal` / GCP with nested virtualization enabled),
 * bootstrap it with the emulator-worker image via cloud-init, and register
 * it as a ComputeHost row once its /health check passes. Left unimplemented
 * so the MVP doesn't depend on any single cloud vendor's SDK; the interface
 * is what matters for now.
 */
export class CloudProvider implements ComputeProvider {
  readonly kind = "CLOUD" as const;

  async ensureHostReady(host: ComputeHost): Promise<void> {
    throw new Error(`CloudProvider is not yet implemented (host ${host.name}).`);
  }

  client(): WorkerClient {
    throw new Error("CloudProvider is not yet implemented.");
  }
}
