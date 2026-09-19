FROM node:20-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
# Prisma's query engine needs OpenSSL present at `generate` time to detect
# the right binary target - node:20-bookworm-slim ships OpenSSL 3, not the
# 1.1.x Prisma otherwise falls back to guessing, which then fails to load
# ("libssl.so.1.1: cannot open shared object file") at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @devicefarm/database run generate
RUN pnpm --filter @devicefarm/device-orchestrator... run build

FROM node:20-bookworm-slim AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
# The Docker compute provider shells out to the host's `docker` CLI to launch
# worker containers, so it needs the CLI (not the daemon) available inside
# this image when COMPUTE_PROVIDER=docker.
RUN apt-get update && apt-get install -y --no-install-recommends docker.io openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY --from=build /repo /repo
ENV NODE_ENV=production
CMD ["node", "services/device-orchestrator/dist/index.js"]
