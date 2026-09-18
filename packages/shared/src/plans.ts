export interface PlanDefinition {
  id: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
  name: string;
  deviceMinutesPerMonth: number | null; // null = custom/unlimited (Enterprise)
  maxConcurrentSessions: number;
  recordingRetentionDays: number;
  priceUsdPerMonth: number | null;
}

/**
 * Billing is deliberately just a table lookup today. Swapping pricing or
 * adding metered add-ons should never require touching orchestration code -
 * only this file and the Stripe price IDs in packages/config.
 */
export const PLAN_DEFINITIONS: Record<PlanDefinition["id"], PlanDefinition> = {
  FREE: {
    id: "FREE",
    name: "Free",
    deviceMinutesPerMonth: 30,
    maxConcurrentSessions: 1,
    recordingRetentionDays: 3,
    priceUsdPerMonth: 0,
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    deviceMinutesPerMonth: 1000,
    maxConcurrentSessions: 3,
    recordingRetentionDays: 30,
    priceUsdPerMonth: 49,
  },
  BUSINESS: {
    id: "BUSINESS",
    name: "Business",
    deviceMinutesPerMonth: 5000,
    maxConcurrentSessions: 10,
    recordingRetentionDays: 90,
    priceUsdPerMonth: 199,
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    deviceMinutesPerMonth: null,
    maxConcurrentSessions: 50,
    recordingRetentionDays: 365,
    priceUsdPerMonth: null,
  },
};

export const USAGE_METRIC_UNIT: Record<string, string> = {
  DEVICE_MINUTES: "minutes",
  CONCURRENT_DEVICES: "devices",
  STORAGE_GB: "GB",
  RECORDINGS: "recordings",
  SESSIONS: "sessions",
};
