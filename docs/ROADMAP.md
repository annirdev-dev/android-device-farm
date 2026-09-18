# Roadmap / known gaps

Things deliberately left as documented stubs rather than faked, in rough
priority order:

1. **WebRTC streaming.** Today's transport is a WebSocket polling
   `screencap` at ~6-7fps (`emulator-worker/src/routes/stream.ts`). Real
   low-latency streaming means capturing the emulator's framebuffer
   continuously (`adb exec-out screenrecord --output-format=h264 -`, or
   running the emulator headless with `-gpu` output piped to `ffmpeg`) and
   publishing it over a WebRTC `MediaStreamTrack` via a signaling exchange on
   `streaming-gateway`. The seam is intentionally narrow: only
   `stream.ts` (worker) and `proxy.ts` (gateway) need to change; the browser
   hook (`use-device-stream.ts`) and `EmulatorProvider` interface stay the
   same shape.
2. **Kubernetes / Cloud compute providers.** Interfaces exist
   (`compute-providers/kubernetes-provider.ts`, `cloud-provider.ts`) and both
   throw a clear "not implemented" error with a TODO describing the intended
   design (Pod-per-host with a KVM device plugin; bare-metal/nested-virt
   cloud instance provisioning). See `infrastructure/kubernetes/README.md`.
3. **Stripe billing.** `BillingProvider` interface + `NoopBillingProvider`
   exist (`apps/api/src/lib/billing-provider.ts`); implementing
   `StripeBillingProvider` plus a webhook handler is the only remaining work
   once `STRIPE_SECRET_KEY` + price IDs are available. Plan limits
   (`packages/shared/src/plans.ts`) are already enforced regardless of which
   billing provider is active.
4. **Transactional email.** Password reset and email verification tokens are
   created and hashed correctly but never emailed - the token is logged
   server-side instead (`apps/api/src/routes/auth.ts`). Wire Postmark/SES/etc.
   at the two `// TODO: send ... via a transactional email provider` markers.
5. **AAB / IPA support.** `app_versions.file_type` already models it, and
   `apps/api/src/routes/app-versions.ts` rejects non-`.apk` uploads with a
   clear message rather than mishandling them. Adding AAB means using
   `bundletool` to derive an installable APK set; adding IPA means the whole
   iOS side (`device_profiles.platform`, an iOS-specific worker/provider).
6. **`setClipboard` on real devices.** There's no stock `adb shell` primitive
   for the system clipboard; `RealAndroidEmulatorProvider.setClipboard`
   throws with a message pointing at preinstalling the open-source
   ADBKeyboard IME and routing through its broadcast intent instead of
   silently no-op'ing.
7. **Golden AVD snapshots** for fast `resetToCleanSnapshot` - see
   `docs/EMULATOR_HOST_SETUP.md` section 6.
8. **OpenTelemetry tracing.** Prometheus metrics exist
   (`apps/api/src/metrics.ts`, `device-orchestrator/src/metrics.ts`); distributed
   tracing across API -> orchestrator -> worker -> gateway is not yet
   instrumented.
9. **iOS support.** `packages/device-types` and the `apps`/`app_versions`
   schema already carry a `platform` field; a real iOS path needs a
   simulator/device farm equivalent of `emulator-worker` (e.g. driving
   `xcrun simctl`) behind the same `EmulatorProvider`-shaped interface.
