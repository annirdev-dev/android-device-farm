# Architecture

```
User -> Frontend (Next.js) -> API (Fastify) -> Redis (BullMQ) -> Device Orchestrator
                                                                        |
                                                                   Scheduler (in-process)
                                                                        |
                                                                  Compute Host (LocalProvider/DockerProvider/K8s*/Cloud*)
                                                                        |
                                                                 Emulator Worker (per host)
                                                                        |
                                                          Android Emulator process (real) or MockEmulatorProvider
                                                                        |
                                                             Streaming Gateway <-> Browser (WebSocket)
```

`*` = interface defined, implementation intentionally stubbed (see `services/device-orchestrator/src/compute-providers/`).

## Request path: "Start Device"

1. Browser calls `POST /api/sessions` (`apps/api/src/routes/sessions.ts`). The
   API creates a `sessions` row with `status=CREATING` and enqueues a
   `session-lifecycle` BullMQ job - the HTTP request returns immediately with
   the session id.
2. `services/device-orchestrator/src/session-lifecycle.ts` picks up the job
   and runs the 12-step flow from the spec, emitting a `SessionProgressEvent`
   after each step to Postgres (`session_events`, audit trail) and to a Redis
   pub/sub channel (`session-events:<id>`) for live delivery.
3. `apps/api/src/routes/ws-session-events.ts` is a WebSocket the browser opens
   per session; it subscribes to that Redis channel and forwards events -
   this is how the "Creating Instance -> Booting Android -> ... -> Ready"
   panel updates live without polling.
4. Host selection: the orchestrator loads all non-offline `compute_hosts`,
   asks `services/scheduler` (`selectHost`) to pick one by resource headroom,
   then resolves that host's `ComputeProvider` (Local/Docker/K8s/Cloud) to get
   an HTTP client for its `emulator-worker`.
5. The orchestrator `POST`s an `EmulatorLaunchSpec` to the worker's
   `/instances` endpoint. The worker creates an isolated AVD (own
   `ANDROID_AVD_HOME`, own console/adb port), boots it, and only returns once
   `sys.boot_completed=1` (or times out) - this is the "load a clean
   snapshot, boot Android, wait for ready" chunk of the workflow, steps 5-7.
6. The orchestrator asks the worker to install the APK (downloaded by the
   worker from a presigned S3 URL) and launch it via `monkey -p <pkg> -c
   android.intent.category.LAUNCHER 1`.
7. The orchestrator mints a one-time `streamingToken` on the session and
   marks it `RUNNING`.
8. The browser opens a second WebSocket directly to `streaming-gateway`
   (`/sessions/:id/stream?token=...`). The gateway validates the token against
   the session row, resolves the worker's address the same way the
   orchestrator did, and proxies binary video frames one way and JSON input
   commands the other - see `services/streaming-gateway/src/proxy.ts`.

## Isolation

Every `EmulatorInstance` gets `workDir = <EMULATOR_DATA_ROOT>/<instanceId>`
containing its own `ANDROID_AVD_HOME`, `ANDROID_SDK_HOME`, `TMPDIR`, and log
directory (`services/emulator-worker/src/providers/real-android-provider.ts`).
The worker derives `workDir` itself from the instance id it generates - it
never trusts a `workDir` value from the network payload, so a compromised
orchestrator can't point `destroy()` at an arbitrary host path. Console/adb
ports are allocated from a per-worker-process pool (`allocateConsolePort` in
`src/adb.ts`) so concurrent instances never collide. `destroy()` `rm -rf`s the
whole `workDir`, so nothing (userdata, sdcard, logs) survives a session.

## Tenant isolation

Every mutating or resource-scoped API route calls `requireOrgMembership(req,
organizationId, [...roles])` (`apps/api/src/auth/middleware.ts`) before
touching the database. List endpoints scope their `WHERE` clause to
`organizationId IN (the caller's memberships)` rather than trusting an id in
the query string. A user from Org A gets a 403 (or the row simply isn't in
their list) for anything under Org B, full stop.

## Compute providers vs. emulator providers - two different seams

- **ComputeProvider** (`device-orchestrator/src/compute-providers/`): how to
  reach (and, for elastic providers, how to bring online) the
  `emulator-worker` running *a given host*. `LocalProvider` assumes it's
  already running; `DockerProvider` `docker run`s a worker container on
  demand and persists its address to `compute_hosts.metadata.workerBaseUrl`;
  `KubernetesProvider`/`CloudProvider` are documented stubs.
- **EmulatorProvider** (`emulator-worker/src/providers/`): how to control
  *the emulator itself* on whichever host the worker is running on.
  `RealAndroidEmulatorProvider` shells out to the real Android SDK tooling;
  `MockEmulatorProvider` fakes the same contract for dev/CI. Only this layer
  knows the difference between a real device and a mock one - everything
  above it (instance-manager, routes, orchestrator, API, frontend) is
  identical either way.

## Streaming transport (v1) and the path to WebRTC

The current transport is a WebSocket carrying binary PNG/SVG frames captured
by polling `adb exec-out screencap -p` (or the mock's synthetic frame
renderer) at ~6-7fps, plus JSON input commands on the same socket
(`emulator-worker/src/routes/stream.ts`). It's genuinely real (actual device
frames, actual `adb shell input` commands) but not low-latency H.264 video.
Swapping to WebRTC only touches two files - this route and
`streaming-gateway/src/proxy.ts` - because both the browser hook
(`use-device-stream.ts`) and the worker's `EmulatorProvider.captureFrame`
already sit behind clean interfaces; see `docs/ROADMAP.md`.
