# This image runs with EMULATOR_PROVIDER=mock out of the box (no KVM or
# Android SDK required) so the platform works end-to-end in any dev
# environment. To serve REAL emulators, build on top of this image (or a
# Linux host directly - see docs/EMULATOR_HOST_SETUP.md) with:
#   - the Android cmdline-tools + `emulator` + `platform-tools` packages
#     installed under ANDROID_SDK_ROOT
#   - the system images referenced by your device_profiles rows
#     (`sdkmanager "system-images;android-35;google_apis;x86_64"` etc.)
#   - /dev/kvm passed through and the container run with --privileged
FROM node:20-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @devicefarm/emulator-worker... run build

FROM node:20-bookworm-slim AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY --from=build /repo /repo
ENV NODE_ENV=production
ENV EMULATOR_PROVIDER=mock
EXPOSE 4200
CMD ["node", "services/emulator-worker/dist/index.js"]
