/**
 * Types shared between the orchestrator, scheduler, and emulator-worker.
 * This package intentionally has zero runtime dependencies so it can be
 * imported from both Node services and (eventually) an iOS-specific worker
 * without dragging in Android-only tooling.
 */

export type Platform = "ANDROID" | "IOS";

export interface DeviceProfileSpec {
  id: string;
  name: string;
  platform: Platform;
  androidVersion: string;
  apiLevel: number;
  resolutionWidth: number;
  resolutionHeight: number;
  densityDpi: number;
  cpuCores: number;
  ramMb: number;
  storageMb: number;
  architecture: "X86_64" | "ARM64";
  emulatorImage: string;
}

/** Resource envelope the scheduler must find room for on a compute host. */
export interface ResourceRequirement {
  cpuMillicores: number;
  ramMb: number;
  diskMb: number;
}

export function resourceRequirementForProfile(profile: DeviceProfileSpec): ResourceRequirement {
  return {
    cpuMillicores: profile.cpuCores * 1000,
    ramMb: profile.ramMb,
    diskMb: profile.storageMb,
  };
}

export interface ComputeHostSnapshot {
  id: string;
  name: string;
  providerType: "LOCAL" | "DOCKER" | "KUBERNETES" | "CLOUD";
  status: "HEALTHY" | "DEGRADED" | "OFFLINE" | "MAINTENANCE";
  kvmEnabled: boolean;
  gpuAvailable: boolean;
  cpuCapacityMillicores: number;
  ramCapacityMb: number;
  diskCapacityMb: number;
  cpuUsagePercent: number;
  ramUsagePercent: number;
  diskUsagePercent: number;
  runningInstanceCount: number;
  maxConcurrentEmulators: number;
}

/**
 * Everything the emulator-worker needs to bring a single, fully isolated
 * emulator instance to life. `instanceId` doubles as the isolation boundary:
 * every path, port, and AVD name is derived from it so two instances can
 * never collide, even on the same host.
 */
export interface EmulatorLaunchSpec {
  instanceId: string;
  sessionId: string;
  deviceProfile: DeviceProfileSpec;
  resourceLimits: ResourceRequirement;
  /** Root directory unique to this instance, e.g. /var/lib/devicefarm/emulators/<instanceId> */
  workDir: string;
}

export interface EmulatorHandle {
  instanceId: string;
  avdName: string;
  adbSerial: string;
  consolePort: number;
  grpcPort?: number;
  pid?: number;
}

export type EmulatorHealthState = "BOOTING" | "READY" | "UNRESPONSIVE" | "CRASHED" | "STOPPED";

export interface EmulatorHealth {
  state: EmulatorHealthState;
  bootCompleted: boolean;
  lastCheckedAt: string;
  detail?: string;
}
