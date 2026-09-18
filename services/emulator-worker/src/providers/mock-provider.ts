import type { EmulatorHandle, EmulatorHealth, EmulatorLaunchSpec } from "@devicefarm/device-types";
import { allocateConsolePort, releaseConsolePort } from "../adb";
import type {
  EmulatorProvider,
  HardwareKey,
  LogLine,
  SwipeCommand,
  TouchCommand,
} from "./types";

interface MockState {
  spec: EmulatorLaunchSpec;
  handle: EmulatorHandle;
  bootedAt?: number;
  installedPackage?: string;
  launchedPackage?: string;
  orientation: "portrait" | "landscape";
  clipboard: string;
  lastTypedText: string;
  lastTouch?: { x: number; y: number; action: string; at: number };
  lastSwipe?: { fromX: number; fromY: number; toX: number; toY: number; at: number };
  lastKey?: HardwareKey;
  logTimer?: ReturnType<typeof setInterval>;
  logSubscribers: Set<(line: LogLine) => void>;
  crashed: boolean;
}

/**
 * Deterministic, dependency-free stand-in for a real Android Emulator.
 *
 * Used only when EMULATOR_PROVIDER=mock (the default outside of a
 * provisioned Linux+KVM host) so the rest of the platform - API,
 * orchestrator, scheduler, streaming gateway, frontend - can be built and
 * exercised end-to-end on a laptop or in CI. It renders a synthetic SVG
 * "screen" that reflects real input (tap position, typed text, orientation)
 * so interaction is visibly wired up, but it is NOT a real device and must
 * never be selectable in a production deployment (enforced at worker boot:
 * see src/index.ts).
 */
export class MockEmulatorProvider implements EmulatorProvider {
  readonly kind = "MOCK" as const;
  private instances = new Map<string, MockState>();

  async create(spec: EmulatorLaunchSpec): Promise<EmulatorHandle> {
    const consolePort = allocateConsolePort();
    const handle: EmulatorHandle = {
      instanceId: spec.instanceId,
      avdName: `mock_${spec.instanceId.slice(0, 8)}`,
      adbSerial: `mock-${consolePort}`,
      consolePort,
    };
    this.instances.set(spec.instanceId, {
      spec,
      handle,
      orientation: "portrait",
      clipboard: "",
      lastTypedText: "",
      logSubscribers: new Set(),
      crashed: false,
    });
    return handle;
  }

  async waitForBoot(handle: EmulatorHandle, timeoutMs: number): Promise<void> {
    const state = this.require(handle.instanceId);
    const bootMs = Math.min(4000, timeoutMs);
    await sleep(bootMs);
    state.bootedAt = Date.now();
  }

  async installApk(handle: EmulatorHandle, _localApkPath: string, packageName: string): Promise<void> {
    const state = this.require(handle.instanceId);
    await sleep(600);
    state.installedPackage = packageName;
  }

  async launchApp(handle: EmulatorHandle, packageName: string): Promise<void> {
    const state = this.require(handle.instanceId);
    await sleep(300);
    state.launchedPackage = packageName;
  }

  async sendTouch(handle: EmulatorHandle, cmd: TouchCommand): Promise<void> {
    const state = this.require(handle.instanceId);
    state.lastTouch = { x: cmd.x, y: cmd.y, action: cmd.action, at: Date.now() };
  }

  async sendSwipe(handle: EmulatorHandle, cmd: SwipeCommand): Promise<void> {
    const state = this.require(handle.instanceId);
    state.lastSwipe = { fromX: cmd.fromX, fromY: cmd.fromY, toX: cmd.toX, toY: cmd.toY, at: Date.now() };
  }

  async sendKey(handle: EmulatorHandle, key: HardwareKey): Promise<void> {
    this.require(handle.instanceId).lastKey = key;
  }

  async sendText(handle: EmulatorHandle, text: string): Promise<void> {
    this.require(handle.instanceId).lastTypedText = text;
  }

  async setClipboard(handle: EmulatorHandle, text: string): Promise<void> {
    this.require(handle.instanceId).clipboard = text;
  }

  async rotate(handle: EmulatorHandle, orientation: "portrait" | "landscape"): Promise<void> {
    this.require(handle.instanceId).orientation = orientation;
  }

  async captureFrame(handle: EmulatorHandle): Promise<Buffer> {
    const state = this.require(handle.instanceId);
    return Buffer.from(renderMockFrameSvg(state), "utf8");
  }

  streamLogs(handle: EmulatorHandle, onLine: (line: LogLine) => void): () => void {
    const state = this.require(handle.instanceId);
    state.logSubscribers.add(onLine);
    if (!state.logTimer) {
      let counter = 0;
      state.logTimer = setInterval(() => {
        counter += 1;
        const line: LogLine = {
          source: "EMULATOR",
          level: "INFO",
          tag: "MockEmulator",
          message: `[mock] heartbeat #${counter} orientation=${state.orientation} launched=${state.launchedPackage ?? "-"}`,
          timestamp: new Date().toISOString(),
        };
        for (const sub of state.logSubscribers) sub(line);
      }, 3000);
    }
    return () => {
      state.logSubscribers.delete(onLine);
      if (state.logSubscribers.size === 0 && state.logTimer) {
        clearInterval(state.logTimer);
        state.logTimer = undefined;
      }
    };
  }

  async getHealth(handle: EmulatorHandle): Promise<EmulatorHealth> {
    const state = this.require(handle.instanceId);
    return {
      state: state.crashed ? "CRASHED" : state.bootedAt ? "READY" : "BOOTING",
      bootCompleted: Boolean(state.bootedAt),
      lastCheckedAt: new Date().toISOString(),
    };
  }

  async restart(handle: EmulatorHandle): Promise<void> {
    const state = this.require(handle.instanceId);
    state.bootedAt = undefined;
    state.crashed = false;
    await this.waitForBoot(handle, 4000);
  }

  async resetToCleanSnapshot(handle: EmulatorHandle): Promise<void> {
    const state = this.require(handle.instanceId);
    state.installedPackage = undefined;
    state.launchedPackage = undefined;
    state.clipboard = "";
    state.lastTypedText = "";
    state.lastTouch = undefined;
    state.lastSwipe = undefined;
    state.orientation = "portrait";
    await this.waitForBoot(handle, 2000);
  }

  async destroy(handle: EmulatorHandle): Promise<void> {
    const state = this.instances.get(handle.instanceId);
    if (!state) return;
    if (state.logTimer) clearInterval(state.logTimer);
    releaseConsolePort(handle.consolePort);
    this.instances.delete(handle.instanceId);
  }

  private require(instanceId: string): MockState {
    const state = this.instances.get(instanceId);
    if (!state) throw new Error(`Unknown mock instance: ${instanceId}`);
    return state;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function renderMockFrameSvg(state: MockState): string {
  const { resolutionWidth: w, resolutionHeight: h } = state.spec.deviceProfile;
  const isLandscape = state.orientation === "landscape";
  const width = isLandscape ? h : w;
  const height = isLandscape ? w : h;
  const dot = state.lastTouch
    ? `<circle cx="${state.lastTouch.x * width}" cy="${state.lastTouch.y * height}" r="18" fill="#22d3ee" opacity="0.85" />`
    : "";
  const swipeLine = state.lastSwipe
    ? `<line x1="${state.lastSwipe.fromX * width}" y1="${state.lastSwipe.fromY * height}" x2="${state.lastSwipe.toX * width}" y2="${state.lastSwipe.toY * height}" stroke="#22d3ee" stroke-width="6" stroke-linecap="round" opacity="0.85" />`
    : "";
  const time = new Date().toLocaleTimeString("en-GB", { hour12: false });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#0b0f19" />
    <rect x="0" y="0" width="100%" height="${Math.round(height * 0.035)}" fill="#111827" />
    <text x="16" y="${Math.round(height * 0.025)}" fill="#9ca3af" font-family="monospace" font-size="${Math.round(height * 0.018)}">${time}  MOCK DEVICE</text>
    <g transform="translate(0, ${Math.round(height * 0.08)})">
      <text x="50%" y="12%" text-anchor="middle" fill="#e5e7eb" font-family="sans-serif" font-size="${Math.round(width * 0.055)}" font-weight="700">${state.spec.deviceProfile.name}</text>
      <text x="50%" y="17%" text-anchor="middle" fill="#6b7280" font-family="monospace" font-size="${Math.round(width * 0.032)}">Android ${state.spec.deviceProfile.androidVersion} (API ${state.spec.deviceProfile.apiLevel})</text>
      <text x="50%" y="24%" text-anchor="middle" fill="#4b5563" font-family="monospace" font-size="${Math.round(width * 0.026)}">instance ${state.spec.instanceId.slice(0, 8)}</text>
      <text x="50%" y="30%" text-anchor="middle" fill="${state.launchedPackage ? "#34d399" : "#6b7280"}" font-family="monospace" font-size="${Math.round(width * 0.03)}">${state.launchedPackage ? `running: ${state.launchedPackage}` : "no app launched"}</text>
      ${state.lastTypedText ? `<text x="50%" y="36%" text-anchor="middle" fill="#e5e7eb" font-family="monospace" font-size="${Math.round(width * 0.03)}">"${escapeXml(state.lastTypedText).slice(0, 40)}"</text>` : ""}
      <text x="50%" y="95%" text-anchor="middle" fill="#374151" font-family="monospace" font-size="${Math.round(width * 0.022)}">MockEmulatorProvider - not a real device</text>
    </g>
    ${dot}
    ${swipeLine}
  </svg>`;
}

function escapeXml(input: string): string {
  return input.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}
