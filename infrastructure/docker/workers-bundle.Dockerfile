# Demo/free-tier-only image: bundles device-orchestrator + streaming-gateway +
# emulator-worker + MinIO into ONE container so a resource-capped Railway
# trial can still run the full platform. This is NOT the recommended
# production topology - see docker-compose.yml and infrastructure/kubernetes/
# for the real one-process-per-service layout. If a process in this bundle
# crashes, the whole container restarts (acceptable for a test deployment,
# not for production).
FROM node:20-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @devicefarm/database run generate
RUN pnpm --filter @devicefarm/device-orchestrator... --filter @devicefarm/streaming-gateway... --filter @devicefarm/emulator-worker... run build

FROM node:20-bookworm-slim AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o /usr/local/bin/minio && \
    chmod +x /usr/local/bin/minio && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY --from=build /repo /repo
COPY infrastructure/docker/workers-bundle-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV NODE_ENV=production
ENV EMULATOR_PROVIDER=mock
EXPOSE 4100 4200 9000 9001
CMD ["/entrypoint.sh"]
