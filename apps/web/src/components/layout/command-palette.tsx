"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

interface Command {
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const router = useRouter();

  const commands: Command[] = React.useMemo(
    () => [
      { label: "Go to Dashboard", run: () => router.push("/dashboard") },
      { label: "Go to Device Lab", run: () => router.push("/devices") },
      { label: "Go to Apps", run: () => router.push("/apps") },
      { label: "Upload an app", run: () => router.push("/apps/upload") },
      { label: "Go to Projects", run: () => router.push("/projects") },
      { label: "Go to Sessions", run: () => router.push("/sessions") },
      { label: "Go to Billing", run: () => router.push("/billing") },
      { label: "Go to Settings", run: () => router.push("/settings") },
    ],
    [router],
  );

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-32 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching commands</p>}
          {filtered.map((c) => (
            <button
              key={c.label}
              onClick={() => {
                c.run();
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
