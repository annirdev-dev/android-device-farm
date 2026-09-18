import fs from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "@devicefarm/config";
import type { EmulatorHandle, EmulatorHealth, EmulatorLaunchSpec } from "@devicefarm/device-types";
import {
  adb,
  adbBinary,
  allocateConsolePort,
  assertValidPackageName,
  encodeForInputText,
  releaseConsolePort,
  run,
  sdkPaths,
  shellQuoteForDevice,
  spawnStreaming,
  type LongRunningProcess,
} from "../adb";
import type {
  EmulatorProvider,
  HardwareKey,
  LogLine,
  SwipeCommand,
  TouchCommand,
} from "./types";

const KEYCODES: Record<HardwareKey, number> = {
  BACK: 4,
  HOME: 3,
  APP_SWITCH: 187,
  POWER: 26,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  ENTER: 66,
  DELETE: 67,
  MENU: 82,
};

interface InstanceRecord {
  spec: EmulatorLaunchSpec;
  handle: EmulatorHandle;
  process?: LongRunningProcess;
  logSubscribers: Set<(line: LogLine) => void>;
  logcatProcess?: LongRunningProcess;
  bootCompleted: boolean;
  lastHealthCheckAt: string;
  crashed: boolean;
}

/**
 * Drives a real, independent `emulator` process per instance using the
 * official Android SDK tooling. This is the ONLY provider that may run in
 * production (enforced by EMULATOR_PROVIDER=real at the worker's boot check).
 *
 * Isolation model: every instance gets its own `workDir` containing its own
 * ANDROID_AVD_HOME/ANDROID_SDK_HOME/TMPDIR, its own AVD (so its own userdata,
 * sdcard, and settings), and its own console/adb port pair. Nothing is
 * shared between two instances, even for the same device profile.
 */
export class RealAndroidEmulatorProvider implements EmulatorProvider {
  readonly kind = "REAL_ANDROID_EMULATOR" as const;
  private instances = new Map<string, InstanceRecord>();

  async create(spec: EmulatorLaunchSpec): Promise<EmulatorHandle> {
    const paths = sdkPaths();
    const avdName = `session_${spec.instanceId.replace(/-/g, "").slice(0, 20)}`;
    const avdHome = path.join(spec.workDir, "avd");
    const avdDir = path.join(avdHome, `${avdName}.avd`);
    const tmpDir = path.join(spec.workDir, "tmp");
    const logsDir = path.join(spec.workDir, "logs");

    await fs.mkdir(avdHome, { recursive: true });
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.mkdir(logsDir, { recursive: true });

    await this.createAvd({
      avdName,
      avdHome,
      systemImage: spec.deviceProfile.emulatorImage,
      ramMb: spec.deviceProfile.ramMb,
      resolutionWidth: spec.deviceProfile.resolutionWidth,
      resolutionHeight: spec.deviceProfile.resolutionHeight,
      densityDpi: spec.deviceProfile.densityDpi,
      storageMb: spec.deviceProfile.storageMb,
    });

    const consolePort = allocateConsolePort();
    const adbSerial = `emulator-${consolePort}`;

    const env = {
      ANDROID_AVD_HOME: avdHome,
      ANDROID_SDK_HOME: spec.workDir,
      ANDROID_EMULATOR_HOME: spec.workDir,
      TMPDIR: tmpDir,
    };

    const args = [
      "-avd",
      avdName,
      "-ports",
      `${consolePort},${consolePort + 1}`,
      "-no-window",
      "-no-audio",
      "-no-boot-anim",
      "-gpu",
      "swiftshader_indirect",
      "-no-snapshot-save",
      "-read-only",
      "-memory",
      String(spec.resourceLimits.ramMb),
      "-cores",
      String(spec.deviceProfile.cpuCores),
      "-verbose",
    ];

    const logStream = await fs.open(path.join(logsDir, "emulator.log"), "a");
    const proc = spawnStreaming(
      paths.emulator,
      args,
      async (line) => {
        await logStream.write(`${line}\n`).catch(() => undefined);
      },
      { env },
    );

    const handle: EmulatorHandle = {
      instanceId: spec.instanceId,
      avdName,
      adbSerial,
      consolePort,
      pid: undefined,
    };

    const record: InstanceRecord = {
      spec,
      handle,
      process: proc,
      logSubscribers: new Set(),
      bootCompleted: false,
      lastHealthCheckAt: new Date().toISOString(),
      crashed: false,
    };
    proc.onExit(() => {
      record.crashed = !record.bootCompleted ? true : record.crashed;
      logStream.close().catch(() => undefined);
    });

    this.instances.set(spec.instanceId, record);
    return handle;
  }

  private async createAvd(opts: {
    avdName: string;
    avdHome: string;
    systemImage: string;
    ramMb: number;
    resolutionWidth: number;
    resolutionHeight: number;
    densityDpi: number;
    storageMb: number;
  }): Promise<void> {
    const paths = sdkPaths();
    const result = await run(
      paths.avdmanager,
      [
        "create",
        "avd",
        "-n",
        opts.avdName,
        "--package",
        opts.systemImage,
        "--path",
        path.join(opts.avdHome, `${opts.avdName}.avd`),
        "--device",
        "pixel_6",
        "--force",
      ],
      { env: { ANDROID_AVD_HOME: opts.avdHome }, input: "no\n", timeoutMs: 60_000 },
    );
    if (result.code !== 0) {
      throw new Error(`avdmanager failed to create AVD ${opts.avdName}: ${result.stderr || result.stdout}`);
    }

    const configPath = path.join(opts.avdHome, `${opts.avdName}.avd`, "config.ini");
    const extra = [
      `hw.lcd.width=${opts.resolutionWidth}`,
      `hw.lcd.height=${opts.resolutionHeight}`,
      `hw.lcd.density=${opts.densityDpi}`,
      `hw.ramSize=${opts.ramMb}`,
      `disk.dataPartition.size=${opts.storageMb}M`,
      "hw.gpu.enabled=yes",
      "hw.keyboard=yes",
    ].join("\n");
    await fs.appendFile(configPath, `\n${extra}\n`);
  }

  async waitForBoot(handle: EmulatorHandle, timeoutMs: number): Promise<void> {
    const record = this.requireInstance(handle.instanceId);
    await adb(handle.adbSerial, ["wait-for-device"], { timeoutMs });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await adb(handle.adbSerial, ["shell", "getprop", "sys.boot_completed"], {
        timeoutMs: 5000,
      }).catch(() => ({ stdout: "", stderr: "", code: 1 }));
      if (result.stdout.trim() === "1") {
        record.bootCompleted = true;
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Emulator ${handle.instanceId} did not report boot_completed within ${timeoutMs}ms`);
  }

  async installApk(handle: EmulatorHandle, localApkPath: string, packageName: string): Promise<void> {
    assertValidPackageName(packageName);
    const result = await adb(handle.adbSerial, ["install", "-r", "-g", localApkPath], { timeoutMs: 120_000 });
    if (result.code !== 0 || /Failure/i.test(result.stdout)) {
      throw new Error(`adb install failed: ${result.stdout || result.stderr}`);
    }
  }

  async launchApp(handle: EmulatorHandle, packageName: string): Promise<void> {
    assertValidPackageName(packageName);
    const result = await adb(
      handle.adbSerial,
      ["shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1"],
      { timeoutMs: 15_000 },
    );
    if (result.code !== 0) {
      throw new Error(`Failed to launch ${packageName}: ${result.stderr || result.stdout}`);
    }
  }

  async sendTouch(handle: EmulatorHandle, cmd: TouchCommand): Promise<void> {
    const record = this.requireInstance(handle.instanceId);
    const [px, py] = this.toPixels(record, cmd.x, cmd.y);
    if (cmd.action === "long_press") {
      await adb(handle.adbSerial, ["shell", "input", "swipe", String(px), String(py), String(px), String(py), "600"]);
      return;
    }
    // Discrete down/move/up are not addressable through `input`; the web
    // client batches drags into a single sendSwipe call instead. A bare tap
    // (or the final "up" of a simple click) is handled here.
    if (cmd.action === "tap" || cmd.action === "up") {
      await adb(handle.adbSerial, ["shell", "input", "tap", String(px), String(py)]);
    }
  }

  async sendSwipe(handle: EmulatorHandle, cmd: SwipeCommand): Promise<void> {
    const record = this.requireInstance(handle.instanceId);
    const [x1, y1] = this.toPixels(record, cmd.fromX, cmd.fromY);
    const [x2, y2] = this.toPixels(record, cmd.toX, cmd.toY);
    await adb(handle.adbSerial, [
      "shell",
      "input",
      "swipe",
      String(x1),
      String(y1),
      String(x2),
      String(y2),
      String(cmd.durationMs),
    ]);
  }

  async sendKey(handle: EmulatorHandle, key: HardwareKey): Promise<void> {
    await adb(handle.adbSerial, ["shell", "input", "keyevent", String(KEYCODES[key])]);
  }

  async sendText(handle: EmulatorHandle, text: string): Promise<void> {
    const encoded = encodeForInputText(text);
    await adb(handle.adbSerial, ["shell", "input", "text", shellQuoteForDevice(encoded)]);
  }

  async setClipboard(_handle: EmulatorHandle, _text: string): Promise<void> {
    // Android has no stock `adb shell` primitive to set the system clipboard.
    // Production hosts should preinstall the open-source ADBKeyboard IME and
    // route this through its `ADB_SET_CLIPBOARD` broadcast intent; until that
    // IME is provisioned we fail loudly instead of silently no-op'ing.
    throw new Error(
      "setClipboard requires the ADBKeyboard IME to be preinstalled on the device image (see docs/EMULATOR_HOST_SETUP.md)",
    );
  }

  async rotate(handle: EmulatorHandle, orientation: "portrait" | "landscape"): Promise<void> {
    await adb(handle.adbSerial, ["shell", "settings", "put", "system", "accelerometer_rotation", "0"]);
    await adb(handle.adbSerial, [
      "shell",
      "settings",
      "put",
      "system",
      "user_rotation",
      orientation === "portrait" ? "0" : "1",
    ]);
  }

  async captureFrame(handle: EmulatorHandle): Promise<Buffer> {
    return adbBinary(handle.adbSerial, ["exec-out", "screencap", "-p"], { timeoutMs: 10_000 });
  }

  streamLogs(handle: EmulatorHandle, onLine: (line: LogLine) => void): () => void {
    const record = this.requireInstance(handle.instanceId);
    record.logSubscribers.add(onLine);

    if (!record.logcatProcess) {
      record.logcatProcess = spawnStreaming(
        sdkPaths().adb,
        ["-s", handle.adbSerial, "logcat", "-v", "time"],
        (line) => {
          const parsed = parseLogcatLine(line);
          for (const sub of record.logSubscribers) sub(parsed);
        },
      );
    }

    return () => {
      record.logSubscribers.delete(onLine);
      if (record.logSubscribers.size === 0 && record.logcatProcess) {
        record.logcatProcess.kill();
        record.logcatProcess = undefined;
      }
    };
  }

  async getHealth(handle: EmulatorHandle): Promise<EmulatorHealth> {
    const record = this.requireInstance(handle.instanceId);
    record.lastHealthCheckAt = new Date().toISOString();
    if (record.crashed) {
      return { state: "CRASHED", bootCompleted: record.bootCompleted, lastCheckedAt: record.lastHealthCheckAt };
    }
    const result = await adb(handle.adbSerial, ["get-state"], { timeoutMs: 5000 }).catch(() => null);
    if (!result || result.code !== 0 || result.stdout.trim() !== "device") {
      return {
        state: record.bootCompleted ? "UNRESPONSIVE" : "BOOTING",
        bootCompleted: record.bootCompleted,
        lastCheckedAt: record.lastHealthCheckAt,
      };
    }
    return { state: "READY", bootCompleted: record.bootCompleted, lastCheckedAt: record.lastHealthCheckAt };
  }

  async restart(handle: EmulatorHandle): Promise<void> {
    const record = this.requireInstance(handle.instanceId);
    record.process?.kill();
    record.bootCompleted = false;
    record.crashed = false;
    await this.create(record.spec).then((newHandle) => {
      Object.assign(handle, newHandle);
    });
    await this.waitForBoot(handle, 180_000);
  }

  async resetToCleanSnapshot(handle: EmulatorHandle): Promise<void> {
    const record = this.requireInstance(handle.instanceId);
    record.process?.kill();
    releaseConsolePort(handle.consolePort);
    const avdHome = path.join(record.spec.workDir, "avd");
    await fs.rm(avdHome, { recursive: true, force: true });
    await this.instances.delete(handle.instanceId);
    const newHandle = await this.create(record.spec);
    Object.assign(handle, newHandle);
    await this.waitForBoot(handle, 180_000);
  }

  async destroy(handle: EmulatorHandle): Promise<void> {
    const record = this.instances.get(handle.instanceId);
    if (!record) return;
    record.logcatProcess?.kill();
    record.process?.kill();
    releaseConsolePort(handle.consolePort);
    this.instances.delete(handle.instanceId);
    await fs.rm(record.spec.workDir, { recursive: true, force: true }).catch(() => undefined);
  }

  private requireInstance(instanceId: string): InstanceRecord {
    const record = this.instances.get(instanceId);
    if (!record) throw new Error(`Unknown emulator instance: ${instanceId}`);
    return record;
  }

  private toPixels(record: InstanceRecord, x: number, y: number): [number, number] {
    const { resolutionWidth, resolutionHeight } = record.spec.deviceProfile;
    return [Math.round(x * resolutionWidth), Math.round(y * resolutionHeight)];
  }
}

function parseLogcatLine(line: string): LogLine {
  // Format: "MM-DD HH:MM:SS.mmm  PID  TID LEVEL TAG: message"
  const match = line.match(/^\d{2}-\d{2}\s+\S+\s+\d+\s+\d+\s+([VDIWEF])\s+([^:]*):\s?(.*)$/);
  const levelMap: Record<string, LogLine["level"]> = {
    V: "VERBOSE",
    D: "DEBUG",
    I: "INFO",
    W: "WARN",
    E: "ERROR",
    F: "FATAL",
  };
  if (!match) {
    return { source: "LOGCAT", level: "INFO", message: line, timestamp: new Date().toISOString() };
  }
  const [, level, tag, message] = match;
  return {
    source: "LOGCAT",
    level: levelMap[level ?? "I"] ?? "INFO",
    tag: tag?.trim(),
    message: message ?? "",
    timestamp: new Date().toISOString(),
  };
}

void loadEnv;
