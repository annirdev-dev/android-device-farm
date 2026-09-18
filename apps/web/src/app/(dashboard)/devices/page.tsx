"use client";

import * as React from "react";
import { Cpu, HardDrive, MemoryStick, MonitorSmartphone, Tablet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api-client";
import type { DeviceProfile } from "@/lib/types";

export default function DevicesPage() {
  const [profiles, setProfiles] = React.useState<DeviceProfile[] | null>(null);
  const [filters, setFilters] = React.useState({ androidVersion: "", architecture: "", formFactor: "" });

  const load = React.useCallback(() => {
    const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)));
    api.get<{ profiles: DeviceProfile[] }>(`/api/device-profiles?${params.toString()}`).then((r) => setProfiles(r.profiles));
  }, [filters]);

  React.useEffect(() => {
    setProfiles(null);
    load();
  }, [load]);

  const androidVersions = Array.from(new Set((profiles ?? []).map((p) => p.androidVersion)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Device Lab</h1>
        <p className="text-sm text-muted-foreground">Real Android Emulator configurations available to launch.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select className="w-48" value={filters.androidVersion} onChange={(e) => setFilters({ ...filters, androidVersion: e.target.value })}>
          <option value="">All Android versions</option>
          {androidVersions.map((v) => (
            <option key={v} value={v}>
              Android {v}
            </option>
          ))}
        </Select>
        <Select className="w-48" value={filters.architecture} onChange={(e) => setFilters({ ...filters, architecture: e.target.value })}>
          <option value="">All architectures</option>
          <option value="X86_64">x86_64</option>
          <option value="ARM64">arm64</option>
        </Select>
        <Select className="w-48" value={filters.formFactor} onChange={(e) => setFilters({ ...filters, formFactor: e.target.value })}>
          <option value="">All form factors</option>
          <option value="PHONE">Phone</option>
          <option value="TABLET">Tablet</option>
        </Select>
      </div>

      {profiles === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <EmptyState icon={MonitorSmartphone} title="No device profiles match those filters" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => (
            <DeviceProfileCard key={p.id} profile={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceProfileCard({ profile }: { profile: DeviceProfile }) {
  const available = profile.availability?.AVAILABLE ?? 0;
  const busy = profile.availability?.BUSY ?? 0;
  const Icon = profile.formFactor === "TABLET" ? Tablet : MonitorSmartphone;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <CardTitle>{profile.name}</CardTitle>
        </div>
        <Badge variant={available > 0 ? "success" : "muted"}>{available > 0 ? "Available" : "At capacity"}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Android {profile.androidVersion} - API {profile.apiLevel} - {profile.architecture === "X86_64" ? "x86_64" : "arm64"}
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Cpu className="h-3.5 w-3.5" /> {profile.cpuCores} vCPU
          </div>
          <div className="flex items-center gap-1">
            <MemoryStick className="h-3.5 w-3.5" /> {(profile.ramMb / 1024).toFixed(1)}GB
          </div>
          <div className="flex items-center gap-1">
            <HardDrive className="h-3.5 w-3.5" /> {(profile.storageMb / 1024).toFixed(0)}GB
          </div>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {profile.resolutionWidth}x{profile.resolutionHeight} @ {profile.densityDpi}dpi
        </p>
        {busy > 0 && <p className="text-xs text-warning">{busy} instance(s) currently in use</p>}
      </CardContent>
    </Card>
  );
}
