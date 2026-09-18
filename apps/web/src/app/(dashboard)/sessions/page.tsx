"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MonitorPlay, Play } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import { formatDuration, relativeTime } from "@/lib/utils";
import type { AppRow, DeviceProfile, Paginated, Project, Session } from "@/lib/types";

export default function SessionsPage() {
  const { currentOrg } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = React.useState<Paginated<Session> | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const load = React.useCallback(() => {
    api.get<Paginated<Session>>("/api/sessions?pageSize=50").then(setSessions);
  }, []);

  React.useEffect(load, [load]);
  React.useEffect(() => {
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Sessions</h1>
          <p className="text-sm text-muted-foreground">Every emulator session, running or finished.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Play className="h-4 w-4" />
          Start Device
        </Button>
      </div>

      {sessions === null ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : sessions.items.length === 0 ? (
        <EmptyState
          icon={MonitorPlay}
          title="No sessions yet"
          description="Start a real, isolated Android Emulator instance in a few clicks."
          action={<Button onClick={() => setDialogOpen(true)}>Start Device</Button>}
        />
      ) : (
        <div className="space-y-2">
          {sessions.items.map((s) => (
            <Link key={s.id} href={`/sessions/${s.id}`}>
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <StatusBadge status={s.status} />
                    <div>
                      <p className="text-sm font-medium">{s.app?.name ?? "App"}</p>
                      <p className="text-xs text-muted-foreground">{s.deviceProfile?.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-xs text-muted-foreground">
                    <span>{s.user?.name ?? s.user?.email}</span>
                    <span>{relativeTime(s.createdAt)}</span>
                    <span>{formatDuration(s.durationSeconds)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <StartSessionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        organizationId={currentOrg?.id}
        onStarted={(id) => router.push(`/sessions/${id}`)}
      />
    </div>
  );
}

function StartSessionDialog({
  open,
  onOpenChange,
  organizationId,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId?: string;
  onStarted: (sessionId: string) => void;
}) {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [projectId, setProjectId] = React.useState("");
  const [apps, setApps] = React.useState<AppRow[]>([]);
  const [appId, setAppId] = React.useState("");
  const [profiles, setProfiles] = React.useState<DeviceProfile[]>([]);
  const [deviceProfileId, setDeviceProfileId] = React.useState("");
  const [starting, setStarting] = React.useState(false);

  React.useEffect(() => {
    if (!open || !organizationId) return;
    api.get<{ projects: Project[] }>(`/api/projects?organizationId=${organizationId}`).then((r) => {
      setProjects(r.projects);
      setProjectId(r.projects[0]?.id ?? "");
    });
    api.get<{ profiles: DeviceProfile[] }>("/api/device-profiles").then((r) => {
      setProfiles(r.profiles);
      setDeviceProfileId(r.profiles[0]?.id ?? "");
    });
  }, [open, organizationId]);

  React.useEffect(() => {
    if (!projectId) return;
    api.get<{ apps: AppRow[] }>(`/api/apps?projectId=${projectId}`).then((r) => {
      setApps(r.apps.filter((a) => a.versions[0]?.status === "READY"));
      setAppId(r.apps[0]?.id ?? "");
    });
  }, [projectId]);

  const selectedApp = apps.find((a) => a.id === appId);
  const latestVersion = selectedApp?.versions[0];

  async function start() {
    if (!latestVersion || !deviceProfileId) return;
    setStarting(true);
    try {
      const { session } = await api.post<{ session: { id: string } }>("/api/sessions", {
        projectId,
        appId,
        appVersionId: latestVersion.id,
        deviceProfileId,
      });
      onOpenChange(false);
      onStarted(session.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to start session");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Start Device" description="Pick an app and a device configuration.">
      <div className="space-y-4">
        <Field label="Project">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Application">
          {apps.length === 0 ? (
            <p className="text-xs text-muted-foreground">No ready app versions in this project. Upload one first.</p>
          ) : (
            <Select value={appId} onChange={(e) => setAppId(e.target.value)}>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.versions[0]?.versionName ?? "latest"})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Device">
          <Select value={deviceProfileId} onChange={(e) => setDeviceProfileId(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} - Android {p.androidVersion}
              </option>
            ))}
          </Select>
        </Field>
        <Button className="w-full" disabled={!latestVersion || !deviceProfileId || starting} onClick={start}>
          {starting ? "Starting..." : "Start Device"}
        </Button>
      </div>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
