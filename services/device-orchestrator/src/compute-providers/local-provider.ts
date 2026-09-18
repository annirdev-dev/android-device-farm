import type { ComputeHost } from "@devicefarm/database";
import { WorkerClient } from "../worker-client";
import { resolveWorkerBaseUrl, type ComputeProvider } from "./types";

/**
 * The host running docker-compose (or a single always-on Linux+KVM box) is
 * already running its emulator-worker process as a long-lived service, so
 * there is nothing to provision - we just need its address.
 */
export class LocalProvider implements ComputeProvider {
  readonly kind = "LOCAL" as const;

  async ensureHostReady(): Promise<void> {
    // No-op: the local worker is expected to already be running.
  }

  client(host: ComputeHost): WorkerClient {
    return new WorkerClient(resolveWorkerBaseUrl(host)!);
  }
}
