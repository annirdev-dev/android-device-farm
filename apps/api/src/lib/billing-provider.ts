import type { PlanDefinition } from "@devicefarm/shared";

export interface CheckoutSession {
  url: string;
}

export interface BillingProvider {
  readonly configured: boolean;
  createCheckoutSession(orgId: string, plan: PlanDefinition["id"], successUrl: string, cancelUrl: string): Promise<CheckoutSession>;
}

/**
 * Returned when STRIPE_SECRET_KEY isn't set. Keeps the API and frontend
 * fully functional without ever pretending to process a real payment - the
 * plans/limits table (packages/shared/src/plans.ts) is the source of truth
 * regardless of which provider is active, so wiring real Stripe later only
 * means implementing this interface, not touching session/usage logic.
 */
class NoopBillingProvider implements BillingProvider {
  readonly configured = false;
  async createCheckoutSession(): Promise<CheckoutSession> {
    throw new Error("Billing is not configured on this deployment. Set STRIPE_SECRET_KEY to enable plan upgrades.");
  }
}

// TODO: implement StripeBillingProvider using the `stripe` SDK once
// STRIPE_SECRET_KEY + STRIPE_PRICE_ID_* env vars are available:
//   - createCheckoutSession: stripe.checkout.sessions.create({ mode: "subscription", ... })
//   - a webhook route (POST /api/billing/webhook) handling
//     checkout.session.completed / customer.subscription.updated to update
//     the `subscriptions` table.

export function getBillingProvider(): BillingProvider {
  return new NoopBillingProvider();
}
