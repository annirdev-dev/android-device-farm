# Device Farm

A self-hosted SaaS platform for testing Android applications on **real,
fully isolated Android Emulator instances**, streamed to the browser. Think
BrowserStack / AWS Device Farm, but running emulators you control.

Every session gets its own emulator process, its own AVD (own userdata,
sdcard, settings), and its own console/adb port pair - two users on the same
device profile never share state. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
for the full design.

## Is this "real" or a mock?

Both, on purpose. `EMULATOR_PROVIDER=mock` (the default everywhere except a
provisioned Linux+KVM host) runs `MockEmulatorProvider`, a dependency-free
stand-in that renders a synthetic device frame and simulates boot/install/
input, so the entire product - upload, device lab, scheduling, sessions,
streaming, logs, billing, admin - works end-to-end on a laptop with no
Android SDK installed. `EMULATOR_PROVIDER=real` runs `RealAndroidEmulatorProvider`,
which spawns the actual `emulator`/`adb`/`avdmanager` binaries from the
Android SDK. The worker **refuses to boot** with `EMULATOR_PROVIDER=mock` in
`NODE_ENV=production` - see `services/emulator-worker/src/providers/index.ts`.

## Project layout

```
apps/
  web/                   Next.js frontend (dashboard, device lab, sessions, admin)
  api/                   REST API - auth, orgs/projects/apps, sessions, billing, admin
services/
  device-orchestrator/   Runs the 12-step "Start Device" workflow as BullMQ jobs
  scheduler/             Pure host-selection logic, called in-process by the orchestrator
  emulator-worker/        Drives real/mock Android Emulator instances on a compute host
  streaming-gateway/      Proxies the browser <-> worker video/control WebSocket
packages/
  database/               Prisma schema + client (single source of truth for the DB)
  shared/                 Cross-service types, zod schemas, queue names, plan definitions
  device-types/           Provider-agnostic types (DeviceProfileSpec, EmulatorLaunchSpec, ...)
  storage/                S3-compatible object storage client (MinIO locally)
  config/                 Typed env loader shared by every backend service
infrastructure/
  docker/                 Per-service Dockerfiles
  kubernetes/             Reference manifests (not wired into a real cluster yet)
  monitoring/             Prometheus + Grafana provisioning
docs/
  ARCHITECTURE.md, SETUP.md, EMULATOR_HOST_SETUP.md, ROADMAP.md
```

## Quickstart (mock provider, no KVM needed)

```bash
corepack enable
cp .env.example .env            # fill in JWT_SECRET at minimum
cp apps/web/.env.example apps/web/.env.local

docker compose up -d postgres redis object-storage

pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed                    # demo org + user (demo@devicefarm.dev / password123) + device profiles

pnpm dev                        # runs every app/service in parallel via turbo
```

Then open http://localhost:3000, sign in with the seeded demo account, upload
an APK, and click **Start Device**. With `EMULATOR_PROVIDER=mock` you'll see a
synthetic device frame reacting to taps/swipes/typed text in real time - the
full orchestration pipeline (scheduler, DB state machine, progress events,
streaming socket) is real; only the "device" itself is simulated.

## Running on a real Linux+KVM host

See [docs/EMULATOR_HOST_SETUP.md](docs/EMULATOR_HOST_SETUP.md). Short version:
install the Android SDK cmdline-tools + `emulator` + `platform-tools` +
system images, confirm `/dev/kvm` is accessible, set `EMULATOR_PROVIDER=real`,
and register the host from the Admin Dashboard (or `POST /api/admin/compute-hosts`).

## Full `docker compose up`

`docker-compose.yml` builds and runs every service, plus Prometheus+Grafana.
The bundled `emulator-worker` image still runs in mock mode by default - swap
`EMULATOR_PROVIDER: real` and add `devices: ["/dev/kvm:/dev/kvm"]` +
`privileged: true` only once you're building that image on an actual
Linux+KVM machine.

## Status

This is a working MVP foundation, not a finished commercial product. What's
real: the full request path from "Start Device" to a running (mock or real)
emulator, tenant-isolated multi-org auth, APK upload + metadata extraction,
device scheduling, live streaming + input, logs, screenshots, recordings,
usage tracking, and an admin dashboard. What's intentionally stubbed with a
clear TODO rather than faked: Kubernetes/Cloud compute providers, Stripe
billing, email delivery, and WebRTC (the stream transport today is a
WebSocket frame-polling channel - see [docs/ROADMAP.md](docs/ROADMAP.md)).
