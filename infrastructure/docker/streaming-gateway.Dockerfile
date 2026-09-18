FROM node:20-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @devicefarm/database run generate
RUN pnpm --filter @devicefarm/streaming-gateway... run build

FROM node:20-bookworm-slim AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY --from=build /repo /repo
ENV NODE_ENV=production
EXPOSE 4100
CMD ["node", "services/streaming-gateway/dist/index.js"]
