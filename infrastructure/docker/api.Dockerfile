# Builds and runs the API service from the full monorepo context.
# Build from the repo root: docker build -f infrastructure/docker/api.Dockerfile .
FROM node:20-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @devicefarm/database run generate
RUN pnpm --filter @devicefarm/api... run build

FROM node:20-bookworm-slim AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY --from=build /repo /repo
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
