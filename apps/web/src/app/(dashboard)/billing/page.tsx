"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import { PLAN_DEFINITIONS, type PlanDefinition } from "@devicefarm/shared";

export default function BillingPage() {
  const { currentOrg } = useAuth();
  const [usage, setUsage] = React.useState<{ plan: PlanDefinition; usage: Record<string, number>; sessionCount: number } | null>(null);
  const [billingConfigured, setBillingConfigured] = React.useState(true);

  React.useEffect(() => {
    if (!currentOrg) return;
    api.get(`/api/usage?organizationId=${currentOrg.id}`).then((r) => setUsage(r as never));
    api.get<{ billingConfigured: boolean }>(`/api/billing/${currentOrg.id}`).then((r) => setBillingConfigured(r.billingConfigured));
  }, [currentOrg]);

  async function upgrade(plan: PlanDefinition["id"]) {
    if (!currentOrg) return;
    try {
      const res = await api.post<{ checkoutUrl?: string; downgraded?: boolean }>(`/api/billing/${currentOrg.id}/checkout`, { plan });
      if (res.checkoutUrl) window.location.href = res.checkoutUrl;
      else toast.success(`Switched to ${plan}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start checkout");
    }
  }

  const deviceMinutesUsed = usage?.usage?.DEVICE_MINUTES ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground">Usage-based plans for device minutes.</p>
      </div>

      {!billingConfigured && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="pt-5 text-sm text-warning">
            Payments aren't configured on this deployment yet (no Stripe key set). You can still switch to Free.
          </CardContent>
        </Card>
      )}

      {usage === null ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Current usage</CardTitle>
            <CardDescription>This billing period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm">
              <span>Device minutes</span>
              <span className="font-mono">
                {deviceMinutesUsed.toFixed(0)} / {usage.plan.deviceMinutesPerMonth ?? "unlimited"}
              </span>
            </div>
            {usage.plan.deviceMinutesPerMonth && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, (deviceMinutesUsed / usage.plan.deviceMinutesPerMonth) * 100)}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.values(PLAN_DEFINITIONS).map((plan) => (
          <Card key={plan.id} className={usage?.plan.id === plan.id ? "border-primary" : undefined}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.priceUsdPerMonth === null ? "Custom" : plan.priceUsdPerMonth === 0 ? "Free" : `$${plan.priceUsdPerMonth}/mo`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <Feature text={`${plan.deviceMinutesPerMonth ?? "Unlimited"} device-minutes/mo`} />
              <Feature text={`${plan.maxConcurrentSessions} concurrent session(s)`} />
              <Feature text={`${plan.recordingRetentionDays}-day recording retention`} />
              <Button
                className="mt-3 w-full"
                variant={usage?.plan.id === plan.id ? "secondary" : "default"}
                disabled={usage?.plan.id === plan.id}
                onClick={() => upgrade(plan.id)}
              >
                {usage?.plan.id === plan.id ? "Current plan" : "Switch"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Check className="h-3 w-3 text-success" />
      {text}
    </div>
  );
}
