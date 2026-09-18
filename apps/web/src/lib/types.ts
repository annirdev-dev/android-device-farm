// Mirrors of the API's JSON response shapes. Deliberately independent of
// @devicefarm/database's Prisma types so the browser bundle never pulls in
// server-only code - this is the contract, hand-kept in sync with the API
// (a natural place to generate from OpenAPI/tRPC later).

export interface User {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin?: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
  role?: "OWNER" | "ADMIN" | "MEMBER" | "BILLING";
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  _count?: { apps: number; sessions: number };
}

export interface AppVersion {
  id: string;
  appId: string;
  fileName: string;
  fileSizeBytes: string;
  versionName: string | null;
  versionCode: number | null;
  minSdkVersion: number | null;
  targetSdkVersion: number | null;
  status: "UPLOADED" | "SCANNING" | "PROCESSING" | "READY" | "FAILED" | "REJECTED";
  statusMessage: string | null;
  createdAt: string;
}

export interface AppRow {
  id: string;
  projectId: string;
  platform: "ANDROID" | "IOS";
  name: string;
  packageName: string;
  iconStorageKey: string | null;
  versions: AppVersion[];
}

export type DeviceStatus = "AVAILABLE" | "STARTING" | "RUNNING" | "BUSY" | "OFFLINE" | "MAINTENANCE";

export interface DeviceProfile {
  id: string;
  name: string;
  manufacturer: string;
  androidVersion: string;
  apiLevel: number;
  resolutionWidth: number;
  resolutionHeight: number;
  densityDpi: number;
  cpuCores: number;
  ramMb: number;
  storageMb: number;
  architecture: "X86_64" | "ARM64";
  formFactor: "PHONE" | "TABLET";
  emulatorImage: string;
  isEnabled: boolean;
  availability?: Partial<Record<DeviceStatus, number>>;
}

export type SessionStatus = "CREATING" | "BOOTING" | "INSTALLING" | "STARTING" | "RUNNING" | "STOPPING" | "STOPPED" | "FAILED";

export interface Session {
  id: string;
  userId: string;
  organizationId: string;
  projectId: string;
  appId: string;
  appVersionId: string;
  deviceProfileId: string;
  status: SessionStatus;
  statusMessage: string | null;
  errorMessage: string | null;
  streamingToken?: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
  app?: AppRow;
  appVersion?: AppVersion;
  deviceProfile?: DeviceProfile;
  user?: { id: string; name: string | null; email: string };
}

export interface SessionEventRow {
  id: string;
  sessionId: string;
  type: string;
  message: string | null;
  payload: unknown;
  createdAt: string;
}

export interface LogRow {
  id: string;
  sessionId: string;
  source: "LOGCAT" | "APPLICATION" | "EMULATOR" | "SYSTEM" | "NETWORK" | "CRASH";
  level: "VERBOSE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
  tag: string | null;
  message: string;
  createdAt: string;
}

export interface Screenshot {
  id: string;
  sessionId: string;
  url: string;
  width: number;
  height: number;
  takenAt: string;
}

export interface Recording {
  id: string;
  sessionId: string;
  status: "RECORDING" | "PROCESSING" | "READY" | "FAILED";
  url: string | null;
  durationSeconds: number | null;
  fileSizeBytes: string | null;
  active?: boolean;
  createdAt: string;
}

export interface ComputeHost {
  id: string;
  name: string;
  providerType: "LOCAL" | "DOCKER" | "KUBERNETES" | "CLOUD";
  hostname: string;
  status: "HEALTHY" | "DEGRADED" | "OFFLINE" | "MAINTENANCE";
  cpuUsagePercent: number;
  ramUsagePercent: number;
  maxConcurrentEmulators: number;
  kvmEnabled: boolean;
  gpuAvailable: boolean;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
