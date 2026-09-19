"use client";

import * as React from "react";
import { Download, Pause, Play, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { STREAMING_GATEWAY_URL, api } from "@/lib/api-client";
import type { LogRow } from "@/lib/types";

const LEVEL_COLOR: Record<string, string> = {
  VERBOSE: "text-muted-foreground",
  DEBUG: "text-muted-foreground",
  INFO: "text-foreground",
  WARN: "text-warning",
  ERROR: "text-destructive",
  FATAL: "text-destructive",
};

export function LogsPanel({ sessionId, live, streamingToken }: { sessionId: string; live: boolean; streamingToken?: string | null }) {
  const [lines, setLines] = React.useState<LogRow[]>([]);
  const [paused, setPaused] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [autoScroll, setAutoScroll] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bufferRef = React.useRef<LogRow[]>([]);

  React.useEffect(() => {
    api.get<{ items: LogRow[] }>(`/api/sessions/${sessionId}/logs?pageSize=200`).then((r) => setLines(r.items));
  }, [sessionId]);

  React.useEffect(() => {
    if (!live || !streamingToken) return;
    const ws = new WebSocket(`${STREAMING_GATEWAY_URL}/sessions/${sessionId}/logcat?token=${streamingToken}`);
    ws.onmessage = (event) => {
      try {
        const line = JSON.parse(event.data);
        // The gateway multiplexes connection-level notices (auth failure,
        // upstream drop) over this same socket - render those as a real
        // error line instead of a blank/garbled log row.
        const row: LogRow =
          line.type === "error"
            ? {
                id: crypto.randomUUID(),
                sessionId,
                source: "SYSTEM",
                level: "ERROR",
                tag: "connection",
                message: line.message ?? "Stream connection error",
                createdAt: new Date().toISOString(),
              }
            : {
                id: crypto.randomUUID(),
                sessionId,
                source: line.source,
                level: line.level,
                tag: line.tag,
                message: line.message,
                createdAt: line.timestamp ?? new Date().toISOString(),
              };
        if (paused) {
          bufferRef.current.push(row);
        } else {
          setLines((prev) => [...prev.slice(-999), row]);
        }
      } catch {
        // ignore malformed line
      }
    };
    return () => ws.close();
  }, [sessionId, live, paused, streamingToken]);

  React.useEffect(() => {
    if (!paused && bufferRef.current.length > 0) {
      setLines((prev) => [...prev.slice(-999), ...bufferRef.current].slice(-1000));
      bufferRef.current = [];
    }
  }, [paused]);

  React.useEffect(() => {
    if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, autoScroll]);

  const filtered = lines.filter(
    (l) => (!level || l.level === level) && (!search || l.message.toLowerCase().includes(search.toLowerCase())),
  );

  function downloadLogs() {
    const text = filtered.map((l) => `${l.createdAt} [${l.level}] ${l.tag ?? l.source}: ${l.message}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${sessionId}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-border p-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search logs..." className="h-7 flex-1 text-xs" />
        <Select value={level} onChange={(e) => setLevel(e.target.value)} className="h-7 w-24 text-xs">
          <option value="">All</option>
          <option value="WARN">Warn</option>
          <option value="ERROR">Error</option>
          <option value="FATAL">Fatal</option>
        </Select>
      </div>
      <div className="flex items-center gap-1 border-b border-border p-1.5">
        <IconBtn onClick={() => setPaused((p) => !p)} title={paused ? "Resume" : "Pause"}>
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </IconBtn>
        <IconBtn onClick={() => setLines([])} title="Clear">
          <Trash2 className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn onClick={downloadLogs} title="Download">
          <Download className="h-3.5 w-3.5" />
        </IconBtn>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
          Auto-scroll
        </label>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
        {filtered.length === 0 && <p className="p-4 text-center text-muted-foreground">No logs yet</p>}
        {filtered.map((l) => (
          <div key={l.id} className="whitespace-pre-wrap break-all">
            <span className="text-muted-foreground">{new Date(l.createdAt).toLocaleTimeString()}</span>{" "}
            <span className={LEVEL_COLOR[l.level]}>[{l.level}]</span> <span className="text-muted-foreground">{l.tag ?? l.source}:</span> {l.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
      {children}
    </button>
  );
}
