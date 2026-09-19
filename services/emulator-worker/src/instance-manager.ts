import type { EmulatorHandle, EmulatorLaunchSpec } from "@devicefarm/device-types";
import { getEmulatorProvider } from "./providers";
import type { LogLine } from "./providers/types";

export type WorkerInstanceStatus =
  | "PROVISIONING"
  | "BOOTING"
  | "READY"
  | "INSTALLING"
  | "STARTING"
  | "BUSY"
  | "STOPPING"
  | "STOPPED"
  | "FAILED";

interface ManagedInstance {
  handle: EmulatorHandle;
  spec: EmulatorLaunchSpec;
  status: WorkerInstanceStatus;
  error?: string;
  createdAt: string;
}

/**
 * Everything running on THIS compute host, keyed by instanceId. This is the
 * boundary the streaming-gateway and the device-orchestrator talk to over
 * HTTP/WS - neither ever imports an EmulatorProvider directly.
 */
class InstanceManager {
  private instances = new Map<string, ManagedInstance>();

  list() {
    return [...this.instances.values()].map((i) => ({
      instanceId: i.handle.instanceId,
      status: i.status,
      adbSerial: i.handle.adbSerial,
      consolePort: i.handle.consolePort,
      error: i.error,
      createdAt: i.createdAt,
    }));
  }

  get(instanceId: string): ManagedInstance | undefined {
    return this.instances.get(instanceId);
  }

  count(): number {
    return this.instances.size;
  }

  /**
   * Sums the resource budget this worker has actually committed to its
   * tracked instances (booting or running). Used for the /capacity endpoint
   * instead of raw OS-wide memory/CPU pressure, which on a shared dev
   * machine reflects every other app the user has open (browser, IDE, etc.)
   * and has nothing to do with whether another emulator fits.
   */
  allocatedResources(): { ramMb: number; cpuMillicores: number } {
    let ramMb = 0;
    let cpuMillicores = 0;
    for (const instance of this.instances.values()) {
      if (instance.status === "STOPPING" || instance.status === "STOPPED" || instance.status === "FAILED") continue;
      ramMb += instance.spec.resourceLimits.ramMb;
      cpuMillicores += instance.spec.resourceLimits.cpuMillicores;
    }
    return { ramMb, cpuMillicores };
  }

  async createInstance(spec: EmulatorLaunchSpec): Promise<ManagedInstance> {
    const provider = getEmulatorProvider();
    const managed: ManagedInstance = {
      handle: { instanceId: spec.instanceId, avdName: "", adbSerial: "", consolePort: 0 },
      spec,
      status: "PROVISIONING",
      createdAt: new Date().toISOString(),
    };
    this.instances.set(spec.instanceId, managed);

    try {
      const handle = await provider.create(spec);
      managed.handle = handle;
      managed.status = "BOOTING";

      await provider.waitForBoot(handle, 180_000);
      managed.status = "READY";
      return managed;
    } catch (err) {
      managed.status = "FAILED";
      managed.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async installAndLaunch(instanceId: string, localApkPath: string, packageName: string): Promise<void> {
    const managed = this.require(instanceId);
    const provider = getEmulatorProvider();
    try {
      managed.status = "INSTALLING";
      await provider.installApk(managed.handle, localApkPath, packageName);
      managed.status = "STARTING";
      await provider.launchApp(managed.handle, packageName);
      managed.status = "READY";
    } catch (err) {
      managed.status = "FAILED";
      managed.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async destroyInstance(instanceId: string): Promise<void> {
    const managed = this.instances.get(instanceId);
    if (!managed) return;
    managed.status = "STOPPING";
    const provider = getEmulatorProvider();
    await provider.destroy(managed.handle);
    managed.status = "STOPPED";
    this.instances.delete(instanceId);
  }

  async restartInstance(instanceId: string): Promise<void> {
    const managed = this.require(instanceId);
    const provider = getEmulatorProvider();
    managed.status = "BOOTING";
    await provider.restart(managed.handle);
    managed.status = "READY";
  }

  async resetInstance(instanceId: string): Promise<void> {
    const managed = this.require(instanceId);
    const provider = getEmulatorProvider();
    managed.status = "BOOTING";
    await provider.resetToCleanSnapshot(managed.handle);
    managed.status = "READY";
  }

  async captureFrame(instanceId: string): Promise<Buffer> {
    const managed = this.require(instanceId);
    return getEmulatorProvider().captureFrame(managed.handle);
  }

  subscribeLogs(instanceId: string, onLine: (line: LogLine) => void): () => void {
    const managed = this.require(instanceId);
    return getEmulatorProvider().streamLogs(managed.handle, onLine);
  }

  async health(instanceId: string) {
    const managed = this.require(instanceId);
    return getEmulatorProvider().getHealth(managed.handle);
  }

  handleOf(instanceId: string): EmulatorHandle {
    return this.require(instanceId).handle;
  }

  private require(instanceId: string): ManagedInstance {
    const managed = this.instances.get(instanceId);
    if (!managed) throw new Error(`No instance ${instanceId} on this worker`);
    return managed;
  }
}

export const instanceManager = new InstanceManager();
