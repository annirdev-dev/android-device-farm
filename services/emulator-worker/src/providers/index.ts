import { loadEnv } from "@devicefarm/config";
import { RealAndroidEmulatorProvider } from "./real-android-provider";
import { MockEmulatorProvider } from "./mock-provider";
import type { EmulatorProvider } from "./types";

let singleton: EmulatorProvider | undefined;

export function getEmulatorProvider(): EmulatorProvider {
  if (singleton) return singleton;

  const env = loadEnv();

  if (env.NODE_ENV === "production" && env.EMULATOR_PROVIDER === "mock") {
    // Hard safety rail from the spec: the mock provider must never silently
    // stand in for real hardware in production. Refuse to boot instead.
    throw new Error(
      "Refusing to start: EMULATOR_PROVIDER=mock in NODE_ENV=production. " +
        "MockEmulatorProvider is for local development and CI only. " +
        "Set EMULATOR_PROVIDER=real on a Linux host with KVM and the Android SDK installed.",
    );
  }

  singleton = env.EMULATOR_PROVIDER === "real" ? new RealAndroidEmulatorProvider() : new MockEmulatorProvider();
  return singleton;
}

export type { EmulatorProvider } from "./types";
