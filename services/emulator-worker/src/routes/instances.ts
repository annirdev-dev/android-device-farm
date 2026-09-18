import type { FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadEnv } from "@devicefarm/config";
import {
  keyInputSchema,
  rotateSchema,
  swipeInputSchema,
  textInputSchema,
  touchInputSchema,
  clipboardSchema,
} from "@devicefarm/shared";
import type { EmulatorLaunchSpec } from "@devicefarm/device-types";
import { instanceManager } from "../instance-manager";
import { getEmulatorProvider } from "../providers";

export async function instancesRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, provider: getEmulatorProvider().kind }));

  app.get("/capacity", async () => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const load = os.loadavg()[0] ?? 0;
    const cpuCount = os.cpus().length;
    return {
      cpuUsagePercent: Math.min(100, (load / Math.max(1, cpuCount)) * 100),
      ramUsagePercent: ((totalMem - freeMem) / totalMem) * 100,
      runningInstanceCount: instanceManager.count(),
      provider: getEmulatorProvider().kind,
    };
  });

  app.get("/instances", async () => instanceManager.list());

  app.get("/instances/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const instance = instanceManager.get(id);
    if (!instance) return reply.code(404).send({ error: "not_found" });
    return instance;
  });

  app.post("/instances", async (req, reply) => {
    // workDir is always derived from this host's own config, never trusted
    // from the network payload - an attacker-supplied path here would let a
    // "destroy" call later rm -rf anything on the host.
    const body = req.body as Omit<EmulatorLaunchSpec, "workDir">;
    const env = loadEnv();
    const spec: EmulatorLaunchSpec = { ...body, workDir: path.join(env.EMULATOR_DATA_ROOT, body.instanceId) };
    try {
      const managed = await instanceManager.createInstance(spec);
      return reply.code(201).send({ instanceId: managed.handle.instanceId, handle: managed.handle, status: managed.status });
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: "create_failed", message: (err as Error).message });
    }
  });

  app.post("/instances/:id/install", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { apkUrl, packageName } = req.body as { apkUrl: string; packageName: string };
    const env = loadEnv();
    const localPath = path.join(env.EMULATOR_DATA_ROOT, id, "tmp", "app.apk");
    try {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      const res = await fetch(apkUrl);
      if (!res.ok || !res.body) throw new Error(`Failed to download APK: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(localPath, buf);

      await instanceManager.installAndLaunch(id, localPath, packageName);
      return { ok: true };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: "install_failed", message: (err as Error).message });
    }
  });

  app.delete("/instances/:id", async (req) => {
    const { id } = req.params as { id: string };
    await instanceManager.destroyInstance(id);
    return { ok: true };
  });

  app.post("/instances/:id/restart", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await instanceManager.restartInstance(id);
      return { ok: true };
    } catch (err) {
      return reply.code(500).send({ error: "restart_failed", message: (err as Error).message });
    }
  });

  app.post("/instances/:id/reset", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await instanceManager.resetInstance(id);
      return { ok: true };
    } catch (err) {
      return reply.code(500).send({ error: "reset_failed", message: (err as Error).message });
    }
  });

  app.get("/instances/:id/health", async (req) => {
    const { id } = req.params as { id: string };
    return instanceManager.health(id);
  });

  app.get("/instances/:id/screenshot", async (req, reply) => {
    const { id } = req.params as { id: string };
    const frame = await instanceManager.captureFrame(id);
    const contentType = getEmulatorProvider().kind === "MOCK" ? "image/svg+xml" : "image/png";
    reply.header("content-type", contentType);
    return reply.send(frame);
  });

  app.post("/instances/:id/input/touch", async (req, reply) => {
    const { id } = req.params as { id: string };
    const cmd = touchInputSchema.parse(req.body);
    await getEmulatorProvider().sendTouch(instanceManager.handleOf(id), cmd);
    return { ok: true };
  });

  app.post("/instances/:id/input/swipe", async (req) => {
    const { id } = req.params as { id: string };
    const cmd = swipeInputSchema.parse(req.body);
    await getEmulatorProvider().sendSwipe(instanceManager.handleOf(id), cmd);
    return { ok: true };
  });

  app.post("/instances/:id/input/key", async (req) => {
    const { id } = req.params as { id: string };
    const { keyCode } = keyInputSchema.parse(req.body);
    await getEmulatorProvider().sendKey(instanceManager.handleOf(id), keyCode);
    return { ok: true };
  });

  app.post("/instances/:id/input/text", async (req) => {
    const { id } = req.params as { id: string };
    const { text } = textInputSchema.parse(req.body);
    await getEmulatorProvider().sendText(instanceManager.handleOf(id), text);
    return { ok: true };
  });

  app.post("/instances/:id/clipboard", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { text } = clipboardSchema.parse(req.body);
    try {
      await getEmulatorProvider().setClipboard(instanceManager.handleOf(id), text);
      return { ok: true };
    } catch (err) {
      return reply.code(501).send({ error: "not_supported", message: (err as Error).message });
    }
  });

  app.post("/instances/:id/rotate", async (req) => {
    const { id } = req.params as { id: string };
    const { orientation } = rotateSchema.parse(req.body);
    await getEmulatorProvider().rotate(instanceManager.handleOf(id), orientation);
    return { ok: true };
  });
}
