import type { ComputeHost, ComputeProviderType } from "@devicefarm/database";
import { LocalProvider } from "./local-provider";
import { DockerProvider } from "./docker-provider";
import { KubernetesProvider } from "./kubernetes-provider";
import { CloudProvider } from "./cloud-provider";
import type { ComputeProvider } from "./types";

const providers: Record<ComputeProviderType, ComputeProvider> = {
  LOCAL: new LocalProvider(),
  DOCKER: new DockerProvider(),
  KUBERNETES: new KubernetesProvider(),
  CLOUD: new CloudProvider(),
};

export function computeProviderFor(host: ComputeHost): ComputeProvider {
  return providers[host.providerType];
}

export type { ComputeProvider } from "./types";
