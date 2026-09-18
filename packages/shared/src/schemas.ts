import { z } from "zod";

export const emailSchema = z.string().email().max(254);
export const passwordSchema = z.string().min(8).max(128);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(120),
  organizationName: z.string().min(1).max(120).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const requestPasswordResetSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  description: z.string().max(500).optional(),
});

export const createAppSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(120),
});

export const startSessionSchema = z.object({
  projectId: z.string().uuid(),
  appId: z.string().uuid(),
  appVersionId: z.string().uuid(),
  deviceProfileId: z.string().uuid(),
});

// --- Remote control input ---------------------------------------------------

export const touchInputSchema = z.object({
  x: z.number().min(0).max(1), // normalized 0..1 relative to device viewport
  y: z.number().min(0).max(1),
  action: z.enum(["down", "up", "move", "tap", "long_press"]).default("tap"),
});

export const swipeInputSchema = z.object({
  fromX: z.number().min(0).max(1),
  fromY: z.number().min(0).max(1),
  toX: z.number().min(0).max(1),
  toY: z.number().min(0).max(1),
  durationMs: z.number().int().min(16).max(5000).default(300),
});

export const keyInputSchema = z.object({
  keyCode: z.enum([
    "BACK",
    "HOME",
    "APP_SWITCH",
    "POWER",
    "VOLUME_UP",
    "VOLUME_DOWN",
    "ENTER",
    "DELETE",
    "MENU",
  ]),
});

export const textInputSchema = z.object({
  text: z.string().max(4000),
});

export const rotateSchema = z.object({
  orientation: z.enum(["portrait", "landscape"]),
});

export const clipboardSchema = z.object({
  text: z.string().max(10000),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type TouchInput = z.infer<typeof touchInputSchema>;
export type SwipeInput = z.infer<typeof swipeInputSchema>;
export type KeyInput = z.infer<typeof keyInputSchema>;
export type TextInput = z.infer<typeof textInputSchema>;
