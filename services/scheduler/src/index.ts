import type { ComputeHostSnapshot, ResourceRequirement } from "@devicefarm/device-types";
import { InsufficientCapacityError } from "@devicefarm/shared";

export interface SchedulingCandidate {
  host: ComputeHostSnapshot;
  /** True if this host's compute-worker has the requested device profile's system image available. */
  hasImageAvailable: boolean;
}

export interface ScoredCandidate {
  host: ComputeHostSnapshot;
  score: number;
  reason: string;
}

/**
 * Pure, dependency-free host-selection logic. It is deliberately NOT a
 * network service in the MVP - the device-orchestrator imports and calls it
 * in-process - but the interface takes plain data in and returns plain data
 * out, so it can be lifted behind its own API later (per the architecture
 * diagram: Orchestrator -> Scheduler -> Compute Host) without rewriting the
 * scoring logic itself.
 */
export class Scheduler {
  /**
   * Picks the best compute host for a device profile's resource requirement.
   * Filters out anything unhealthy, without room, or missing the image, then
   * scores the rest by headroom (lower utilization wins) with a penalty for
   * hosts already running many instances, so load spreads out rather than
   * bin-packing onto a single box.
   */
  selectHost(requirement: ResourceRequirement, candidates: SchedulingCandidate[]): ComputeHostSnapshot {
    const eligible = candidates.filter((c) => this.isEligible(requirement, c));

    if (eligible.length === 0) {
      throw new InsufficientCapacityError();
    }

    const scored = eligible
      .map((c) => this.score(requirement, c))
      .sort((a, b) => b.score - a.score);

    return scored[0]!.host;
  }

  explain(requirement: ResourceRequirement, candidates: SchedulingCandidate[]): ScoredCandidate[] {
    return candidates
      .filter((c) => this.isEligible(requirement, c))
      .map((c) => this.score(requirement, c))
      .sort((a, b) => b.score - a.score);
  }

  private isEligible(requirement: ResourceRequirement, candidate: SchedulingCandidate): boolean {
    const { host, hasImageAvailable } = candidate;
    if (host.status !== "HEALTHY") return false;
    if (!hasImageAvailable) return false;
    if (host.runningInstanceCount >= host.maxConcurrentEmulators) return false;

    const projectedCpuPercent =
      host.cpuUsagePercent + (requirement.cpuMillicores / host.cpuCapacityMillicores) * 100;
    const projectedRamPercent = host.ramUsagePercent + (requirement.ramMb / host.ramCapacityMb) * 100;
    const projectedDiskPercent = host.diskUsagePercent + (requirement.diskMb / host.diskCapacityMb) * 100;

    return projectedCpuPercent <= 95 && projectedRamPercent <= 95 && projectedDiskPercent <= 95;
  }

  private score(requirement: ResourceRequirement, candidate: SchedulingCandidate): ScoredCandidate {
    const { host } = candidate;
    const cpuHeadroom = 100 - host.cpuUsagePercent;
    const ramHeadroom = 100 - host.ramUsagePercent;
    const diskHeadroom = 100 - host.diskUsagePercent;
    const slotHeadroom =
      ((host.maxConcurrentEmulators - host.runningInstanceCount) / host.maxConcurrentEmulators) * 100;

    // Weighted average: RAM is usually the tightest constraint for emulators.
    const score = cpuHeadroom * 0.25 + ramHeadroom * 0.4 + diskHeadroom * 0.1 + slotHeadroom * 0.25;

    return {
      host,
      score,
      reason: `cpu=${cpuHeadroom.toFixed(0)}% ram=${ramHeadroom.toFixed(0)}% disk=${diskHeadroom.toFixed(0)}% slots=${slotHeadroom.toFixed(0)}%`,
    };
  }
}

export const scheduler = new Scheduler();
