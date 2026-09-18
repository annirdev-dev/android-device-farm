"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Server, Users, Building2, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { api, ApiError } from "@/lib/api-client";
import type { ComputeHost, Paginated, Session } from "@/lib/types";

interface Overview {
  users: number;
  organizations: number;
  activeSessions: number;
  failedSessionsLast24h: number;
  emulatorInstances: number;
}

export default function AdminPage() {
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [hosts, setHosts] = React.useState<ComputeHost[]>([]);
  const [sessions, setSessions] = React.useState<Paginated<Session> | null>(null);
  const [hostDialogOpen, setHostDialogOpen] = React.useState(false);

  const load = React.useCallback(() => {
    api.get<Overview>("/api/admin/overview").then(setOverview);
    api.get<{ hosts: ComputeHost[] }>("/api/admin/compute-hosts").then((r) => setHosts(r.hosts));
    api.get<Paginated<Session>>("/api/admin/sessions?pageSize=20").then(setSessions);
  }, []);

  React.useEffect(load, [load]);

  async function forceStop(id: string) {
    try {
      await api.post(`/api/admin/sessions/${id}/force-stop`);
      toast.success("Session force-stopped");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to stop session");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">Platform-wide infrastructure and tenants.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat icon={Users} label="Users" value={overview?.users} />
        <Stat icon={Building2} label="Organizations" value={overview?.organizations} />
        <Stat icon={Activity} label="Active sessions" value={overview?.activeSessions} />
        <Stat icon={Server} label="Emulator instances" value={overview?.emulatorInstances} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Compute hosts</CardTitle>
          <Button size="sm" onClick={() => setHostDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add host
          </Button>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2">Name</th>
                <th className="pb-2">Provider</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">CPU</th>
                <th className="pb-2">RAM</th>
                <th className="pb-2">Max emulators</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {hosts.map((h) => (
                <tr key={h.id}>
                  <td className="py-2">{h.name}</td>
                  <td className="py-2 text-muted-foreground">{h.providerType}</td>
                  <td className="py-2">
                    <StatusBadge status={h.status} />
                  </td>
                  <td className="py-2 font-mono">{h.cpuUsagePercent.toFixed(0)}%</td>
                  <td className="py-2 font-mono">{h.ramUsagePercent.toFixed(0)}%</td>
                  <td className="py-2">{h.maxConcurrentEmulators}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent sessions (all organizations)</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2">App</th>
                <th className="pb-2">User</th>
                <th className="pb-2">Device</th>
                <th className="pb-2">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sessions?.items.map((s) => (
                <tr key={s.id}>
                  <td className="py-2">{s.app?.name}</td>
                  <td className="py-2 text-muted-foreground">{s.user?.email}</td>
                  <td className="py-2 text-muted-foreground">{s.deviceProfile?.name}</td>
                  <td className="py-2">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="py-2 text-right">
                    {!["STOPPED", "FAILED"].includes(s.status) && (
                      <Button size="sm" variant="destructive" onClick={() => forceStop(s.id)}>
                        Force stop
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AddHostDialog open={hostDialogOpen} onOpenChange={setHostDialogOpen} onCreated={load} />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5">
        <Icon className="h-5 w-5 text-primary" />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value ?? "-"}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AddHostDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [form, setForm] = React.useState({
    name: "",
    providerType: "LOCAL",
    hostname: "localhost",
    cpuCapacityMillicores: 8000,
    ramCapacityMb: 16384,
    diskCapacityMb: 204800,
    maxConcurrentEmulators: 4,
    workerPort: 4200,
  });
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/admin/compute-hosts", form);
      toast.success("Compute host added");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add host");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add compute host" description="Register a machine running the emulator-worker service.">
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Provider</Label>
          <Select value={form.providerType} onChange={(e) => setForm({ ...form, providerType: e.target.value })}>
            <option value="LOCAL">Local</option>
            <option value="DOCKER">Docker</option>
            <option value="KUBERNETES">Kubernetes (not yet implemented)</option>
            <option value="CLOUD">Cloud (not yet implemented)</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Hostname</Label>
          <Input value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Max emulators</Label>
            <Input type="number" value={form.maxConcurrentEmulators} onChange={(e) => setForm({ ...form, maxConcurrentEmulators: Number(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label>Worker port</Label>
            <Input type="number" value={form.workerPort} onChange={(e) => setForm({ ...form, workerPort: Number(e.target.value) })} />
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Adding..." : "Add host"}
        </Button>
      </form>
    </Dialog>
  );
}
