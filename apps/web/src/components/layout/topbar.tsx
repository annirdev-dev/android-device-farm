"use client";

import * as React from "react";
import { LogOut, Search, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export function Topbar() {
  const { user, organizations, currentOrg, setCurrentOrgId, logout } = useAuth();
  const [orgMenuOpen, setOrgMenuOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div className="relative">
        <button
          onClick={() => setOrgMenuOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent"
        >
          {currentOrg?.name ?? "Select organization"}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        {orgMenuOpen && (
          <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-card py-1 shadow-lg">
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => {
                  setCurrentOrgId(org.id);
                  setOrgMenuOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
              >
                {org.name}
                <span className="text-xs text-muted-foreground">{org.plan}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        >
          <Search className="h-3.5 w-3.5" />
          Search
          <kbd className="rounded border border-border px-1 text-[10px]">⌘K</kbd>
        </button>

        <div className="relative">
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
          >
            {user?.name?.[0]?.toUpperCase() ?? user?.email[0]?.toUpperCase()}
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-border bg-card py-1 shadow-lg">
              <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">{user?.email}</div>
              <button onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-accent">
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
