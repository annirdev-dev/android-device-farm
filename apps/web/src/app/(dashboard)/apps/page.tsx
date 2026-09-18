"use client";

import * as React from "react";
import Link from "next/link";
import { Package, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api-client";
import { formatBytes, relativeTime } from "@/lib/utils";
import type { AppRow, Project } from "@/lib/types";

export default function AppsPage() {
  const { currentOrg } = useAuth();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [projectId, setProjectId] = React.useState<string>("");
  const [apps, setApps] = React.useState<AppRow[] | null>(null);

  React.useEffect(() => {
    if (!currentOrg) return;
    api.get<{ projects: Project[] }>(`/api/projects?organizationId=${currentOrg.id}`).then((r) => {
      setProjects(r.projects);
      setProjectId((prev) => prev || r.projects[0]?.id || "");
    });
  }, [currentOrg]);

  React.useEffect(() => {
    if (!projectId) return;
    setApps(null);
    api.get<{ apps: AppRow[] }>(`/api/apps?projectId=${projectId}`).then((r) => setApps(r.apps));
  }, [projectId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Apps</h1>
          <p className="text-sm text-muted-foreground">Uploaded APKs and their versions.</p>
        </div>
        <Link href="/apps/upload">
          <Button>
            <Upload className="h-4 w-4" />
            Upload APK
          </Button>
        </Link>
      </div>

      <Select className="w-64" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>

      {apps === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No apps in this project yet"
          description="Upload an APK to extract its package name, version, and icon automatically."
          action={
            <Link href="/apps/upload">
              <Button size="sm">Upload APK</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {apps.map((app) => {
            const latest = app.versions[0];
            return (
              <Card key={app.id}>
                <CardContent className="flex items-center justify-between pt-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{app.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{app.packageName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-xs text-muted-foreground">
                    {latest && (
                      <>
                        <span>{latest.versionName ?? "-"} ({latest.versionCode ?? "-"})</span>
                        <span>{formatBytes(latest.fileSizeBytes)}</span>
                        <span>{relativeTime(latest.createdAt)}</span>
                        <StatusBadge status={latest.status} />
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
