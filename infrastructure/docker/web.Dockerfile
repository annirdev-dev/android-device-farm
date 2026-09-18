FROM node:20-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile=false
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_STREAMING_GATEWAY_URL=ws://localhost:4100
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_STREAMING_GATEWAY_URL=$NEXT_PUBLIC_STREAMING_GATEWAY_URL
RUN pnpm --filter @devicefarm/web... run build

FROM node:20-bookworm-slim AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY --from=build /repo /repo
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@devicefarm/web", "run", "start"]
