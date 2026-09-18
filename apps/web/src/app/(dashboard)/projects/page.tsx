"use client";

import * as React from "react";
import { toast } from "sonner";
import { FolderKanban, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const { currentOrg } = useAuth();
  const [projects, setProjects] = React.useState<Project[] | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(() => {
    if (!currentOrg) return;
    setProjects(null);
    api.get<{ projects: Project[] }>(`/api/projects?organizationId=${currentOrg.id}`).then((r) => setProjects(r.projects));
  }, [currentOrg]);

  React.useEffect(load, [load]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg) return;
    setCreating(true);
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      await api.post("/api/projects", { organizationId: currentOrg.id, name, slug });
      toast.success("Project created");
      setDialogOpen(false);
      setName("");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">Group apps, versions, and sessions by project.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </div>

      {projects === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects yet" description="Create a project to start uploading apps and running sessions." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <CardDescription>{p.description ?? `/${p.slug}`}</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-4 text-xs text-muted-foreground">
                <span>{p._count?.apps ?? 0} apps</span>
                <span>{p._count?.sessions ?? 0} sessions</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} title="New project">
        <form onSubmit={createProject} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <Button type="submit" className="w-full" disabled={creating}>
            {creating ? "Creating..." : "Create project"}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
