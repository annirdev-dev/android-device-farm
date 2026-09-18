# Setup

## Prerequisites

- Node.js >= 20 (for `corepack` and `--env-file`)
- pnpm 9 (`corepack enable` activates the version pinned in `package.json`)
- Docker + Docker Compose (for Postgres/Redis/MinIO, or the whole stack)

## 1. Environment

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

At minimum, set `JWT_SECRET` in `.env` to a random 64-char hex string
(`openssl rand -hex 32`). Everything else has a working local default.

## 2. Infra services

```bash
docker compose up -d postgres redis object-storage
```

## 3. Install + database

```bash
pnpm install
pnpm db:generate    # generates the Prisma client into packages/database/generated
pnpm db:migrate      # creates the schema
pnpm db:seed         # device profiles, a local compute host row, demo org/user
```

Seeded login: `demo@devicefarm.dev` / `password123`.

## 4. Run everything

```bash
pnpm dev
```

This starts, in parallel (via turbo):

| Service | Port | Purpose |
|---|---|---|
| `apps/web` | 3000 | Frontend |
| `apps/api` | 4000 | REST API + auth + WS progress events |
| `services/device-orchestrator` | 9464 (metrics only) | BullMQ workers for session lifecycle/cleanup |
| `services/emulator-worker` | 4200 | Controls emulator instances on this host |
| `services/streaming-gateway` | 4100 | Browser <-> worker video/control proxy |

Open http://localhost:3000, sign in, create a project, upload an `.apk`
(`apps/apps/upload`), then **Start Device** from the Sessions page.

## 5. Registering the local compute host

The seed script already inserts one `compute_hosts` row
(`providerType=LOCAL`, `hostname=localhost`, `metadata.workerPort=4200`) and
marks it `HEALTHY` once `services/device-orchestrator`'s heartbeat loop
successfully polls `GET http://localhost:4200/capacity` - give it ~20s after
`pnpm dev` starts. Check `/admin` in the UI (you'll need to flip
`is_platform_admin=true` on your seeded user in Postgres to see it, e.g. via
`pnpm db:studio`) to confirm host status.

## Common issues

- **"No compute hosts are registered"** when starting a session: the
  heartbeat loop hasn't marked the seeded host `HEALTHY` yet, or
  `emulator-worker` isn't running. Check `pnpm --filter @devicefarm/emulator-worker dev` logs.
- **CORS/cookie errors in the browser**: `WEB_PUBLIC_URL` in `.env` must
  exactly match the origin you're loading the frontend from (including port).
- **Uploads fail with a bucket error**: MinIO buckets are created
  automatically on API boot (`ensureBucketsExist()`); make sure
  `object-storage` is healthy before starting `apps/api`.
