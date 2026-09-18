import type { FastifyInstance } from "fastify";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@devicefarm/database";
import { loginSchema, registerSchema, requestPasswordResetSchema, resetPasswordSchema, ConflictError, UnauthorizedError, NotFoundError } from "@devicefarm/shared";
import { hashPassword, verifyPassword } from "../auth/password";
import { signToken } from "../auth/jwt";
import { authenticate } from "../auth/middleware";

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || randomBytes(4).toString("hex");
}

function setSessionCookie(reply: import("fastify").FastifyReply, token: string) {
  reply.setCookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/register", async (req, reply) => {
    const input = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictError("An account with this email already exists");

    const user = await prisma.user.create({
      data: { email: input.email, name: input.name, passwordHash: hashPassword(input.password) },
    });

    const orgName = input.organizationName ?? `${input.name}'s Organization`;
    let slug = slugify(orgName);
    while (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${slug}-${randomBytes(2).toString("hex")}`;
    }
    const org = await prisma.organization.create({ data: { name: orgName, slug, plan: "FREE" } });
    await prisma.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
    await prisma.subscription.create({
      data: { organizationId: org.id, plan: "FREE", deviceMinutesLimit: 30, currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) },
    });
    await prisma.project.create({ data: { organizationId: org.id, name: "Default Project", slug: "default" } });

    // Email verification is created but sending is a documented TODO - wire an email provider (Postmark/SES) here.
    const verifyToken = randomBytes(24).toString("hex");
    await prisma.emailVerificationToken.create({
      data: { userId: user.id, tokenHash: createHash("sha256").update(verifyToken).digest("hex"), expiresAt: new Date(Date.now() + 86_400_000) },
    });

    const token = signToken({ userId: user.id, email: user.email });
    setSessionCookie(reply, token);
    return reply.code(201).send({ token, user: { id: user.id, email: user.email, name: user.name }, organization: org });
  });

  app.post("/api/auth/login", async (req, reply) => {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user?.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
      throw new UnauthorizedError("Invalid email or password");
    }
    const token = signToken({ userId: user.id, email: user.email });
    setSessionCookie(reply, token);
    return { token, user: { id: user.id, email: user.email, name: user.name } };
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie("token", { path: "/" });
    return { ok: true };
  });

  // Short-lived token for the browser to authenticate the two WebSocket
  // channels (session progress events, device stream control) - those
  // connections can't rely on the httpOnly cookie the way ordinary fetches
  // do, so the client fetches this once per session view and passes it as a
  // query param instead of ever persisting it to localStorage.
  app.get("/api/auth/ws-token", { preHandler: authenticate }, async (req) => {
    const token = signToken({ userId: req.user!.userId, email: req.user!.email });
    return { token };
  });

  app.get("/api/auth/me", { preHandler: authenticate }, async (req) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id },
      include: { organization: true },
    });
    return {
      user: { id: user.id, email: user.email, name: user.name, isPlatformAdmin: user.isPlatformAdmin },
      organizations: memberships.map((m) => ({ ...m.organization, role: m.role })),
    };
  });

  app.post("/api/auth/password-reset/request", async (req) => {
    const { email } = requestPasswordResetSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    // Always return 200 regardless of whether the account exists, to avoid leaking which emails are registered.
    if (user) {
      const resetToken = randomBytes(24).toString("hex");
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: createHash("sha256").update(resetToken).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) },
      });
      // TODO: send resetToken via a transactional email provider instead of logging it.
      req.log.info(`Password reset requested for ${email} (token delivery not yet wired to an email provider)`);
    }
    return { ok: true };
  });

  app.post("/api/auth/password-reset/confirm", async (req) => {
    const { token, password } = resetPasswordSchema.parse(req.body);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new NotFoundError("Reset token");
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash: hashPassword(password) } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    return { ok: true };
  });

  app.get("/api/auth/verify-email/:token", async (req) => {
    const { token } = req.params as { token: string };
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) throw new NotFoundError("Verification token");
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
      prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    return { ok: true };
  });

  // --- Google OAuth ----------------------------------------------------------
  // Full implementation requires GOOGLE_OAUTH_CLIENT_ID/SECRET; without them we
  // return a clear 501 instead of pretending to authenticate.
  app.get("/api/auth/google", async (_req, reply) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      return reply.code(501).send({ error: "NOT_CONFIGURED", message: "Google OAuth is not configured on this deployment" });
    }
    const redirectUri = `${process.env.API_PUBLIC_URL ?? "http://localhost:4000"}/api/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    });
    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get("/api/auth/google/callback", async (req, reply) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return reply.code(501).send({ error: "NOT_CONFIGURED", message: "Google OAuth is not configured on this deployment" });
    }
    const { code } = req.query as { code?: string };
    if (!code) return reply.code(400).send({ error: "MISSING_CODE" });

    const redirectUri = `${process.env.API_PUBLIC_URL ?? "http://localhost:4000"}/api/auth/google/callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    if (!tokenRes.ok) return reply.code(401).send({ error: "OAUTH_FAILED" });
    const { id_token } = (await tokenRes.json()) as { id_token: string };
    const payloadB64 = id_token.split(".")[1];
    const profile = JSON.parse(Buffer.from(payloadB64!, "base64").toString("utf8")) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
    };

    let user = await prisma.user.findUnique({ where: { googleId: profile.sub } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { email: profile.email } });
      if (user) {
        user = await prisma.user.update({ where: { id: user.id }, data: { googleId: profile.sub } });
      } else {
        user = await prisma.user.create({
          data: { email: profile.email, name: profile.name, googleId: profile.sub, avatarUrl: profile.picture, emailVerifiedAt: new Date() },
        });
        const org = await prisma.organization.create({ data: { name: `${profile.name ?? "New"}'s Organization`, slug: slugify(profile.email.split("@")[0] ?? profile.sub) } });
        await prisma.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
        await prisma.subscription.create({ data: { organizationId: org.id, plan: "FREE", deviceMinutesLimit: 30, currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) } });
      }
    }

    const token = signToken({ userId: user.id, email: user.email });
    setSessionCookie(reply, token);
    return reply.redirect(`${process.env.WEB_PUBLIC_URL ?? "http://localhost:3000"}/dashboard`);
  });
}
