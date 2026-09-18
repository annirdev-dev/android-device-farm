import type {
  EmulatorHandle,
  EmulatorHealth,
  EmulatorLaunchSpec,
} from "@devicefarm/device-types";

export interface TouchCommand {
  action: "down" | "up" | "move" | "tap" | "long_press";
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export interface SwipeCommand {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  durationMs: number;
}

export type HardwareKey =
  | "BACK"
  | "HOME"
  | "APP_SWITCH"
  | "POWER"
  | "VOLUME_UP"
  | "VOLUME_DOWN"
  | "ENTER"
  | "DELETE"
  | "MENU";

export interface LogLine {
  source: "LOGCAT" | "EMULATOR" | "SYSTEM" | "CRASH";
  level: "VERBOSE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
  tag?: string;
  message: string;
  timestamp: string;
}

/**
 * Everything the worker needs from "a thing that can be an Android device".
 * `RealAndroidEmulatorProvider` drives the actual Android Emulator/adb.
 * `MockEmulatorProvider` fakes the same contract for laptops/CI without KVM.
 * Nothing outside this file (routes, instance-manager) should know which one
 * is active - swap only happens at the factory in providers/index.ts, keyed
 * off EMULATOR_PROVIDER env var, and production deploys must never resolve
 * to "mock".
 */
export interface EmulatorProvider {
  readonly kind: "REAL_ANDROID_EMULATOR" | "MOCK";

  create(spec: EmulatorLaunchSpec): Promise<EmulatorHandle>;
  waitForBoot(handle: EmulatorHandle, timeoutMs: number): Promise<void>;
  installApk(handle: EmulatorHandle, localApkPath: string, packageName: string): Promise<void>;
  launchApp(handle: EmulatorHandle, packageName: string): Promise<void>;

  sendTouch(handle: EmulatorHandle, cmd: TouchCommand): Promise<void>;
  sendSwipe(handle: EmulatorHandle, cmd: SwipeCommand): Promise<void>;
  sendKey(handle: EmulatorHandle, key: HardwareKey): Promise<void>;
  sendText(handle: EmulatorHandle, text: string): Promise<void>;
  setClipboard(handle: EmulatorHandle, text: string): Promise<void>;
  rotate(handle: EmulatorHandle, orientation: "portrait" | "landscape"): Promise<void>;

  captureFrame(handle: EmulatorHandle): Promise<Buffer>; // PNG or JPEG bytes
  streamLogs(handle: EmulatorHandle, onLine: (line: LogLine) => void): () => void; // returns unsubscribe

  getHealth(handle: EmulatorHandle): Promise<EmulatorHealth>;
  restart(handle: EmulatorHandle): Promise<void>;
  resetToCleanSnapshot(handle: EmulatorHandle): Promise<void>;
  destroy(handle: EmulatorHandle): Promise<void>;
}
