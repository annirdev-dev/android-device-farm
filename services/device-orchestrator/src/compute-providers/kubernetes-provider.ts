import type { ComputeHost } from "@devicefarm/database";
import type { WorkerClient } from "../worker-client";
import type { ComputeProvider } from "./types";

/**
 * TODO(k8s): schedule one emulator-worker Pod per compute host onto a node
 * pool labeled `devicefarm.io/kvm=true`, using a device plugin (e.g.
 * kubevirt's or a custom one) to expose /dev/kvm, and a Service (or the pod
 * IP via a headless Service) for the orchestrator to reach it at :4200. See
 * infrastructure/kubernetes/emulator-worker-deployment.yaml for the shape
 * this would take. Deliberately not implemented against a live cluster here
 * so business logic in session-lifecycle.ts stays provider-agnostic - only
 * this class would need to grow when a cluster is available.
 */
export class KubernetesProvider implements ComputeProvider {
  readonly kind = "KUBERNETES" as const;

  async ensureHostReady(host: ComputeHost): Promise<void> {
    throw new Error(
      `KubernetesProvider is not yet implemented (host ${host.name}). ` +
        "See infrastructure/kubernetes/ for the target manifests and TODO in this file.",
    );
  }

  client(): WorkerClient {
    throw new Error("KubernetesProvider is not yet implemented.");
  }
}
