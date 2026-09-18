import type { FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import { prisma } from "@devicefarm/database";
import { NotFoundError, ConflictError } from "@devicefarm/shared";
import { BUCKETS, deleteObject, objectKeyForRecording, presignedGetUrl, uploadObject } from "@devicefarm/storage";
import { authenticate, requireOrgMembership } from "../auth/middleware";
import { isRecordingActive, startRecording, stopRecording } from "../lib/recording-manager";
import { resolveWorkerBaseUrl } from "../lib/worker-url";

async function requireSessionAccess(req: import("fastify").FastifyRequest, sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { emulatorInstance: { include: { computeHost: true } } },
  });
  if (!session) throw new NotFoundError("Session");
  if (!req.user!.isPlatformAdmin) await requireOrgMembership(req, session.organizationId);
  return session;
}

export async function recordingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.post("/api/sessions/:id/recordings/start", async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await requireSessionAccess(req, id);
    if (!session.emulatorInstance) throw new ConflictError("Session has no running instance");

    const baseUrl = resolveWorkerBaseUrl(session.emulatorInstance.computeHost);
    if (!baseUrl) throw new ConflictError("Could not reach this session's compute host");
    const instanceId = session.emulatorInstance.id;

    const recording = await prisma.recording.create({ data: { sessionId: id, status: "RECORDING" } });

    startRecording(recording.id, async () => {
      const res = await fetch(`${baseUrl}/instances/${instanceId}/screenshot`);
      if (!res.ok) throw new Error(`screenshot failed: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      return { buffer, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
    });

    return reply.code(201).send({ recording });
  });

  app.post("/api/recordings/:id/stop", async (req) => {
    const { id } = req.params as { id: string };
    const recording = await prisma.recording.findUnique({ where: { id } });
    if (!recording) throw new NotFoundError("Recording");
    await requireSessionAccess(req, recording.sessionId);

    await prisma.recording.update({ where: { id }, data: { status: "PROCESSING" } });
    const result = await stopRecording(id);
    if (!result || result.fileSizeBytes === 0) {
      const updated = await prisma.recording.update({
        where: { id },
        data: { status: "FAILED", endedAt: new Date() },
      });
      return { recording: updated, warning: "No video was produced. Is ffmpeg installed on the API host, and is EMULATOR_PROVIDER=real?" };
    }

    const buffer = await fs.readFile(result.filePath);
    const storageKey = objectKeyForRecording(recording.sessionId, id);
    await uploadObject(BUCKETS.recordings, storageKey, buffer, "video/mp4");
    await fs.unlink(result.filePath).catch(() => undefined);

    const updated = await prisma.recording.update({
      where: { id },
      data: {
        status: "READY",
        storageKey,
        durationSeconds: result.durationSeconds,
        fileSizeBytes: BigInt(result.fileSizeBytes),
        endedAt: new Date(),
      },
    });
    return { recording: { ...updated, fileSizeBytes: updated.fileSizeBytes?.toString() } };
  });

  app.get("/api/sessions/:id/recordings", async (req) => {
    const { id } = req.params as { id: string };
    await requireSessionAccess(req, id);
    const recordings = await prisma.recording.findMany({ where: { sessionId: id, deletedAt: null }, orderBy: { createdAt: "desc" } });
    const withUrls = await Promise.all(
      recordings.map(async (r) => ({
        ...r,
        fileSizeBytes: r.fileSizeBytes?.toString(),
        url: r.storageKey ? await presignedGetUrl(BUCKETS.recordings, r.storageKey, 900) : null,
        active: isRecordingActive(r.id),
      })),
    );
    return { recordings: withUrls };
  });

  app.delete("/api/recordings/:id", async (req) => {
    const { id } = req.params as { id: string };
    const recording = await prisma.recording.findUnique({ where: { id } });
    if (!recording) throw new NotFoundError("Recording");
    await requireSessionAccess(req, recording.sessionId);

    if (recording.storageKey) await deleteObject(BUCKETS.recordings, recording.storageKey).catch(() => undefined);
    await prisma.recording.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}
