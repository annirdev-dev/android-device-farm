import type { EmulatorLaunchSpec, EmulatorHandle } from "@devicefarm/device-types";

/**
 * HTTP client for a single emulator-worker instance running on a compute
 * host. This is the only thing the orchestrator knows about a host's
 * internals - it never touches adb/emulator directly.
 */
export class WorkerClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Worker request failed (${res.status} ${path}): ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async capacity(): Promise<{ cpuUsagePercent: number; ramUsagePercent: number; runningInstanceCount: number }> {
    return this.request("/capacity");
  }

  async health(): Promise<{ ok: boolean; provider: string }> {
    return this.request("/health");
  }

  async createInstance(spec: Omit<EmulatorLaunchSpec, "workDir">): Promise<{ handle: EmulatorHandle }> {
    return this.request("/instances", { method: "POST", body: JSON.stringify(spec) });
  }

  async installAndLaunch(instanceId: string, apkUrl: string, packageName: string): Promise<void> {
    await this.request(`/instances/${instanceId}/install`, {
      method: "POST",
      body: JSON.stringify({ apkUrl, packageName }),
    });
  }

  async destroyInstance(instanceId: string): Promise<void> {
    await this.request(`/instances/${instanceId}`, { method: "DELETE" });
  }

  async restartInstance(instanceId: string): Promise<void> {
    await this.request(`/instances/${instanceId}/restart`, { method: "POST" });
  }

  async resetInstance(instanceId: string): Promise<void> {
    await this.request(`/instances/${instanceId}/reset`, { method: "POST" });
  }

  async instanceHealth(instanceId: string): Promise<{ state: string; bootCompleted: boolean }> {
    return this.request(`/instances/${instanceId}/health`);
  }
}
