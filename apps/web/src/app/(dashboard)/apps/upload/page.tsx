"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, FileArchive } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import { formatBytes } from "@/lib/utils";
import type { Project } from "@/lib/types";

export default function UploadAppPage() {
  const { currentOrg } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [projectId, setProjectId] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [uploading, setUploading] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);

  React.useEffect(() => {
    if (!currentOrg) return;
    api.get<{ projects: Project[] }>(`/api/projects?organizationId=${currentOrg.id}`).then((r) => {
      setProjects(r.projects);
      setProjectId((prev) => prev || r.projects[0]?.id || "");
    });
  }, [currentOrg]);

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".apk")) {
      toast.error("Only .apk files are supported today");
      return;
    }
    setFile(f);
  }

  async function upload() {
    if (!file || !projectId) return;
    setUploading(true);
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append("projectId", projectId);
      formData.append("file", file);
      const result = await api.upload<{ app: { id: string } }>("/api/apps/upload", formData, setProgress);
      toast.success("Upload complete - scanning in the background");
      router.push(`/apps`);
      void result;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Upload an app</h1>
        <p className="text-sm text-muted-foreground">We'll extract the package name, version, SDK levels, and icon automatically.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project</CardTitle>
          <CardDescription>Which project should this app belong to?</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>APK file</CardTitle>
        </CardHeader>
        <CardContent>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files[0]);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-12 transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <input type="file" accept=".apk" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
            {file ? (
              <>
                <FileArchive className="h-8 w-8 text-primary" />
                <div className="text-center">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                </div>
              </>
            ) : (
              <>
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Drag & drop an .apk, or click to browse</p>
              </>
            )}
          </label>

          {uploading && (
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          <Button className="mt-4 w-full" disabled={!file || !projectId || uploading} onClick={upload}>
            {uploading ? `Uploading... ${progress}%` : "Upload"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
