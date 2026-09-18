import { z } from "zod";

/**
 * Every backend service (api, device-orchestrator, scheduler, emulator-worker,
 * streaming-gateway) loads its env through this one schema so a missing var
 * fails fast at boot instead of surfacing as a mystery 500 later.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),

  API_PORT: z.coerce.number().int().default(4000),
  API_PUBLIC_URL: z.string().default("http://localhost:4000"),
  WEB_PUBLIC_URL: z.string().default("http://localhost:3000"),

  STREAMING_GATEWAY_PORT: z.coerce.number().int().default(4100),
  STREAMING_GATEWAY_PUBLIC_URL: z.string().default("ws://localhost:4100"),

  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),

  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().default("devicefarm"),
  S3_SECRET_ACCESS_KEY: z.string().default("devicefarm-secret"),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  S3_BUCKET_APPS: z.string().default("devicefarm-apps"),
  S3_BUCKET_SCREENSHOTS: z.string().default("devicefarm-screenshots"),
  S3_BUCKET_RECORDINGS: z.string().default("devicefarm-recordings"),

  /** "mock" for laptops/CI without KVM, "real" only on a Linux+KVM host. Never "real" implicitly. */
  EMULATOR_PROVIDER: z.enum(["mock", "real"]).default("mock"),
  COMPUTE_PROVIDER: z.enum(["local", "docker", "kubernetes", "cloud"]).default("local"),

  ANDROID_SDK_ROOT: z.string().default("/opt/android-sdk"),
  EMULATOR_DATA_ROOT: z.string().default("/var/lib/devicefarm/emulators"),

  SESSION_ABANDONED_TIMEOUT_MINUTES: z.coerce.number().default(10),
  SESSION_MAX_DURATION_MINUTES: z.coerce.number().default(60),

  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration. See stderr for details.");
  }
  cached = parsed.data;
  return cached;
}
