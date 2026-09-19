"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera,
  Circle,
  Home,
  RotateCw,
  Square,
  RefreshCw,
  ChevronLeft,
  LayoutGrid,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { DeleteSessionDialog } from "@/components/delete-session-dialog";
import { api, ApiError } from "@/lib/api-client";
import { formatDuration } from "@/lib/utils";
import type { Session } from "@/lib/types";
import { useDeviceStream } from "./use-device-stream";
import { useSessionEvents } from "./use-session-events";
import { LogsPanel } from "./logs-panel";

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [session, setSession] = React.useState<Session | null>(null);
  const [recording, setRecording] = React.useState<{ id: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const dragStart = React.useRef<{ x: number; y: number } | null>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);

  const loadSession = React.useCallback(() => {
    api.get<{ session: Session }>(`/api/sessions/${sessionId}`).then((r) => setSession(r.session));
  }, [sessionId]);

  React.useEffect(loadSession, [loadSession]);
  React.useEffect(() => {
    if (!session || session.status === "STOPPED" || session.status === "FAILED") return;
    // Poll faster while a session is still coming up (progress events cover
    // most of that), and slower once RUNNING - just enough to notice if the
    // session ends server-side (e.g. reaped as abandoned, or crashed) so the
    // UI doesn't sit forever showing a dead "Connecting to device stream...".
    const interval = setInterval(loadSession, session.status === "RUNNING" ? 10000 : 2000);
    return () => clearInterval(interval);
  }, [session, loadSession]);

  const progress = useSessionEvents(sessionId);
  const isRunning = session?.status === "RUNNING";
  const { frameUrl, connected, fps, sendInput } = useDeviceStream(sessionId, session?.streamingToken ?? undefined, isRunning);

  function normalizedCoords(clientX: number, clientY: number): { x: number; y: number } | null {
    const el = imgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)) };
  }

  function onPointerDown(e: React.PointerEvent) {
    dragStart.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const distance = Math.hypot(dx, dy);
    const start = normalizedCoords(dragStart.current.x, dragStart.current.y);
    const end = normalizedCoords(e.clientX, e.clientY);
    dragStart.current = null;
    if (!start || !end) return;

    if (distance < 8) {
      sendInput("touch", { x: end.x, y: end.y, action: "tap" });
    } else {
      sendInput("swipe", { fromX: start.x, fromY: start.y, toX: end.x, toY: end.y, durationMs: 300 });
    }
  }

  async function sendKey(keyCode: string) {
    try {
      await api.post(`/api/sessions/${sessionId}/input/key`, { keyCode });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to send key");
    }
  }

  async function rotate() {
    try {
      await api.post(`/api/sessions/${sessionId}/rotate`, { orientation: "landscape" });
      toast.success("Rotation requested");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to rotate");
    }
  }

  async function takeScreenshot() {
    try {
      await api.post(`/api/sessions/${sessionId}/screenshot`);
      toast.success("Screenshot saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to capture screenshot");
    }
  }

  async function toggleRecording() {
    try {
      if (recording) {
        await api.post(`/api/recordings/${recording.id}/stop`);
        setRecording(null);
        toast.success("Recording saved");
      } else {
        const { recording: r } = await api.post<{ recording: { id: string } }>(`/api/sessions/${sessionId}/recordings/start`);
        setRecording(r);
        toast.success("Recording started");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Recording failed");
    }
  }

  async function restart() {
    try {
      await api.post(`/api/sessions/${sessionId}/restart`);
      toast.success("Restarting device");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Restart failed");
    }
  }

  async function stopSession() {
    try {
      await api.post(`/api/sessions/${sessionId}/stop`);
      toast.success("Session stopping");
      router.push("/sessions");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to stop session");
    }
  }

  async function deleteSession() {
    try {
      await api.delete(`/api/sessions/${sessionId}`);
      toast.success("Session deleted");
      router.push("/sessions");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete session");
    }
  }

  if (!session) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading session...</div>;
  }

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-[240px_1fr_280px] gap-0">
      {/* Left: session info */}
      <div className="flex flex-col border-r border-border bg-card p-4">
        <Link href="/sessions" className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sessions
        </Link>
        <p className="text-sm font-semibold">{session.app?.name}</p>
        <p className="mb-4 font-mono text-xs text-muted-foreground">{session.appVersion?.versionName}</p>
        <StatusBadge status={session.status} />

        <div className="mt-6 space-y-3 text-xs">
          <InfoRow label="Device" value={session.deviceProfile?.name ?? "-"} />
          <InfoRow label="Android" value={session.deviceProfile ? `${session.deviceProfile.androidVersion} (API ${session.deviceProfile.apiLevel})` : "-"} />
          <InfoRow label="Resolution" value={session.deviceProfile ? `${session.deviceProfile.resolutionWidth}x${session.deviceProfile.resolutionHeight}` : "-"} />
          <InfoRow label="Started" value={session.startedAt ? new Date(session.startedAt).toLocaleTimeString() : "-"} />
          <InfoRow label="Duration" value={formatDuration(session.durationSeconds)} />
        </div>

        {(session.status === "STOPPED" || session.status === "FAILED") && (
          <Button variant="destructive" size="sm" className="mt-6" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete Session
          </Button>
        )}
      </div>

      {/* Center: device viewport */}
      <div className="flex flex-col items-center justify-between overflow-hidden bg-black/40 p-6">
        {session.status === "STOPPED" || session.status === "FAILED" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <Square className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">{session.status === "FAILED" ? "Session failed" : "Session stopped"}</p>
            {session.errorMessage && <p className="max-w-xs text-xs text-muted-foreground">{session.errorMessage}</p>}
            <Link href="/sessions" className="mt-2 text-xs text-primary underline">
              Back to sessions
            </Link>
          </div>
        ) : !isRunning ? (
          <SessionProgress step={progress.step} label={progress.label} percent={progress.progressPercent} message={progress.message ?? session.errorMessage ?? undefined} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="relative overflow-hidden rounded-[2rem] border-4 border-neutral-800 bg-black shadow-2xl" style={{ aspectRatio: `${session.deviceProfile?.resolutionWidth ?? 1080} / ${session.deviceProfile?.resolutionHeight ?? 2400}`, height: "min(72vh, 800px)" }}>
              {frameUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  ref={imgRef}
                  src={frameUrl}
                  alt="Live device screen"
                  className="h-full w-full select-none object-contain"
                  draggable={false}
                  onPointerDown={onPointerDown}
                  onPointerUp={onPointerUp}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  {connected ? "Waiting for first frame..." : "Connecting to device stream..."}
                </div>
              )}
            </div>
          </div>
        )}

        {isRunning && (
          <div className="mt-4 flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1.5">
            <ToolbarButton icon={ChevronLeft} label="Back" onClick={() => sendKey("BACK")} />
            <ToolbarButton icon={Home} label="Home" onClick={() => sendKey("HOME")} />
            <ToolbarButton icon={LayoutGrid} label="Recent" onClick={() => sendKey("APP_SWITCH")} />
            <div className="mx-1 h-5 w-px bg-border" />
            <ToolbarButton icon={RotateCw} label="Rotate" onClick={rotate} />
            <ToolbarButton icon={Camera} label="Screenshot" onClick={takeScreenshot} />
            <ToolbarButton icon={Circle} label={recording ? "Stop rec." : "Record"} onClick={toggleRecording} active={Boolean(recording)} />
            <ToolbarButton icon={RefreshCw} label="Restart" onClick={restart} />
            <div className="mx-1 h-5 w-px bg-border" />
            <Button variant="destructive" size="sm" onClick={stopSession}>
              <Square className="h-3.5 w-3.5" />
              Stop Session
            </Button>
          </div>
        )}
      </div>

      {/* Right: device stats + logs */}
      <div className="flex flex-col border-l border-border bg-card">
        <div className="space-y-3 border-b border-border p-4 text-xs">
          <InfoRow label="Stream" value={connected ? "Connected" : "Disconnected"} />
          <InfoRow label="FPS" value={String(fps)} />
          <InfoRow label="CPU (host)" value="live via Admin > Compute Hosts" />
        </div>
        <div className="flex-1 overflow-hidden">
          <LogsPanel sessionId={sessionId} live={isRunning} streamingToken={session.streamingToken} />
        </div>
      </div>

      <DeleteSessionDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={deleteSession} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ToolbarButton({ icon: Icon, label, onClick, active }: { icon: React.ElementType; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-accent ${active ? "text-destructive" : "text-foreground"}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function SessionProgress({ step, label, percent, message }: { step: string; label: string; percent: number; message?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <div className="h-16 w-16 animate-pulse rounded-2xl bg-primary/15" />
      <div className="w-72 text-center">
        <p className="text-sm font-medium">{step === "FAILED" ? "Session failed" : label}</p>
        {message && <p className="mt-1 text-xs text-muted-foreground">{message}</p>}
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={`h-full transition-all ${step === "FAILED" ? "bg-destructive" : "bg-primary"}`} style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}
