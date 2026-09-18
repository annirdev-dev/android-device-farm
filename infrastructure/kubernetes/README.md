# Kubernetes (reference manifests, not wired up yet)

These manifests describe the target shape from the architecture diagram:

```
Kubernetes
├── API                  (apps/api)
├── Frontend             (apps/web)
├── Redis
├── PostgreSQL           (use a managed instance in real deployments)
├── Device Orchestrator  (services/device-orchestrator)
├── Scheduler            (in-process inside device-orchestrator today)
├── Streaming Gateway    (services/streaming-gateway)
└── Emulator Workers     (services/emulator-worker, on KVM-capable nodes only)
```

None of the application code imports a Kubernetes client or assumes it is
running in a cluster - `services/device-orchestrator/src/compute-providers/kubernetes-provider.ts`
is the single, deliberately unimplemented seam where cluster-specific logic
would go (creating a Pod per compute host, exposing it via a Service, and
persisting the resulting address onto `compute_hosts.metadata.workerBaseUrl`
the same way `docker-provider.ts` does for Docker).

**Emulator workers need `/dev/kvm`.** That means:

1. A dedicated node pool labeled `devicefarm.io/kvm=true`, on instance types
   with nested virtualization enabled (e.g. GCP `-metal` or nested-virt
   images, AWS bare-metal instances, or dedicated on-prem hardware).
2. Either a hostPath mount of `/dev/kvm` with a `securityContext` granting
   the container access, or (cleaner, production-grade) a device plugin that
   exposes `devicefarm.io/kvm` as an allocatable resource so pods don't need
   `privileged: true`.
3. `emulator-worker-deployment.yaml` shows the hostPath + privileged form
   since it doesn't require installing a device plugin first; swap to a
   resource request once one is deployed.

Apply order once a real cluster + device plugin exist: `namespace.yaml` →
`configmap.yaml` + your own `secrets.yaml` (never commit real secrets) →
`redis.yaml` → `api-deployment.yaml` → `device-orchestrator-deployment.yaml`
→ `streaming-gateway-deployment.yaml` → `emulator-worker-deployment.yaml` →
`web-deployment.yaml`.
