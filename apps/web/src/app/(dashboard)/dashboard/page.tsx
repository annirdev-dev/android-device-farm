"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, Package, Smartphone, Clock, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api-client";
import { relativeTime } from "@/lib/utils";
import type { Paginated, Session } from "@/lib/types";

export default function DashboardPage() {
  const { currentOrg } = useAuth();
  const [sessions, setSessions] = React.useState<Session[] | null>(null);
  const [usage, setUsage] = React.useState<{ plan: { name: string; deviceMinutesPerMonth: number | null }; usage: Record<string, number> } | null>(null);

  React.useEffect(() => {
    if (!currentOrg) return;
    api.get<Paginated<Session>>("/api/sessions?pageSize=5").then((r) => setSessions(r.items));
    api.get(`/api/usage?organizationId=${currentOrg.id}`).then((r) => setUsage(r as never));
  }, [currentOrg]);

  const activeSessions = sessions?.filter((s) => !["STOPPED", "FAILED"].includes(s.status)).length ?? 0;
  const deviceMinutesUsed = usage?.usage?.DEVICE_MINUTES ?? 0;
  const deviceMinutesLimit = usage?.plan?.deviceMinutesPerMonth;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of {currentOrg?.name ?? "your organization"}</p>
        </div>
        <Link href="/sessions">
          <Button>
            Start Device
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Activity} label="Active sessions" value={String(activeSessions)} />
        <StatCard
          icon={Clock}
          label="Device minutes used"
          value={deviceMinutesLimit ? `${deviceMinutesUsed.toFixed(0)} / ${deviceMinutesLimit}` : deviceMinutesUsed.toFixed(0)}
        />
        <StatCard icon={Package} label="Plan" value={usage?.plan?.name ?? "-"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions === null ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={Smartphone}
              title="No sessions yet"
              description="Start your first Android emulator session from the Sessions page."
              action={
                <Link href="/sessions">
                  <Button size="sm">Start Device</Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {sessions.map((s) => (
                <Link key={s.id} href={`/sessions/${s.id}`} className="flex items-center justify-between py-3 text-sm hover:opacity-80">
                  <div>
                    <p className="font-medium">{s.app?.name ?? "App"}</p>
                    <p className="text-xs text-muted-foreground">{s.deviceProfile?.name} - {relativeTime(s.createdAt)}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
