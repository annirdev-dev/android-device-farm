import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma, type ComputeHost } from "@devicefarm/database";
import { WorkerClient } from "../worker-client";
import { resolveWorkerBaseUrl, type ComputeProvider } from "./types";

const execFileAsync = promisify(execFile);

interface DockerHostState {
  containerId: string;
  hostPort: number;
}

/**
 * Runs one emulator-worker container per compute host on demand, with
 * /dev/kvm passed through for hardware-accelerated emulation. Requires the
 * `devicefarm/emulator-worker` image to be built (see
 * infrastructure/docker/emulator-worker.Dockerfile) and the Docker daemon to
 * be reachable from wherever the orchestrator runs.
 */
export class DockerProvider implements ComputeProvider {
  readonly kind = "DOCKER" as const;
  private hosts = new Map<string, DockerHostState>();

  async ensureHostReady(host: ComputeHost): Promise<void> {
    if (this.hosts.has(host.id)) return;

    const metadata = (host.metadata as Record<string, unknown> | null) ?? {};
    const image = (metadata.dockerImage as string | undefined) ?? "devicefarm/emulator-worker:latest";

    const args = [
      "run",
      "-d",
      "--rm",
      "--privileged", // required for /dev/kvm hardware acceleration
      "--device",
      "/dev/kvm",
      "-p",
      "0:4200",
      "--name",
      `devicefarm-worker-${host.id.slice(0, 8)}`,
      "-e",
      "EMULATOR_PROVIDER=real",
      image,
    ];

    try {
      const { stdout } = await execFileAsync("docker", args);
      const containerId = stdout.trim();
      const { stdout: portOut } = await execFileAsync("docker", ["port", containerId, "4200/tcp"]);
      const hostPort = Number(portOut.trim().split(":").pop());
      this.hosts.set(host.id, { containerId, hostPort });

      const existingMetadata = (host.metadata as Record<string, unknown> | null) ?? {};
      await prisma.computeHost.update({
        where: { id: host.id },
        data: { metadata: { ...existingMetadata, workerBaseUrl: `http://127.0.0.1:${hostPort}` } },
      });
    } catch (err) {
      throw new Error(
        `DockerProvider failed to start a worker container for host ${host.name}: ${(err as Error).message}. ` +
          "Ensure Docker is installed, the daemon is reachable, and /dev/kvm exists on this machine.",
      );
    }
  }

  client(host: ComputeHost): WorkerClient {
    const state = this.hosts.get(host.id);
    if (state) return new WorkerClient(`http://127.0.0.1:${state.hostPort}`);

    const persisted = resolveWorkerBaseUrl(host);
    if (!persisted) {
      throw new Error(`Docker worker for host ${host.id} has not been provisioned yet - call ensureHostReady first`);
    }
    return new WorkerClient(persisted);
  }

  async teardown(hostId: string): Promise<void> {
    const state = this.hosts.get(hostId);
    if (!state) return;
    await execFileAsync("docker", ["stop", state.containerId]).catch(() => undefined);
    this.hosts.delete(hostId);
  }
}
