import type { FastifyInstance } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@devicefarm/database";
import { NotFoundError, ValidationError } from "@devicefarm/shared";
import { BUCKETS, objectKeyForAppVersion, presignedGetUrl, uploadObject } from "@devicefarm/storage";
import { authenticate, requireOrgMembership } from "../auth/middleware";
import { isLikelyApk, parseApkMetadata } from "../lib/apk-metadata";
import { appProcessingQueue } from "../lib/queues";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB - generous ceiling for APKs/AABs

export async function appVersionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.post("/api/apps/upload", async (req, reply) => {
    const data = await req.file({ limits: { fileSize: MAX_UPLOAD_BYTES } });
    if (!data) throw new ValidationError("No file uploaded (expected multipart field 'file')");

    const projectId = (data.fields.projectId as { value?: string } | undefined)?.value;
    if (!projectId) throw new ValidationError("Missing 'projectId' field");

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundError("Project");
    await requireOrgMembership(req, project.organizationId, ["OWNER", "ADMIN", "MEMBER"]);

    if (!/\.apk$/i.test(data.filename)) {
      throw new ValidationError("Only .apk files are supported today (AAB/IPA support is planned - see docs/ROADMAP.md)");
    }

    const buffer = await data.toBuffer();
    if (!isLikelyApk(buffer)) {
      throw new ValidationError("File failed validation: not a valid APK (bad ZIP header)");
    }

    let metadata;
    try {
      metadata = await parseApkMetadata(buffer);
    } catch (err) {
      throw new ValidationError(`Could not parse APK: ${(err as Error).message}`);
    }
    if (!metadata.packageName) {
      throw new ValidationError("Could not determine the app's package name from the APK manifest");
    }

    const checksumSha256 = createHash("sha256").update(buffer).digest("hex");

    const appRow = await prisma.app.upsert({
      where: { projectId_platform_packageName: { projectId, platform: "ANDROID", packageName: metadata.packageName } },
      update: { name: metadata.appName ?? undefined },
      create: {
        projectId,
        platform: "ANDROID",
        packageName: metadata.packageName,
        name: metadata.appName ?? metadata.packageName,
      },
    });

    const versionId = randomUUID();
    const storageKey = objectKeyForAppVersion(appRow.id, versionId, data.filename);
    await uploadObject(BUCKETS.apps, storageKey, buffer, "application/vnd.android.package-archive");

    let iconStorageKey: string | undefined;
    if (metadata.iconBase64?.startsWith("data:image")) {
      const iconBuffer = Buffer.from(metadata.iconBase64.split(",")[1] ?? "", "base64");
      iconStorageKey = `apps/${appRow.id}/versions/${versionId}/icon.png`;
      await uploadObject(BUCKETS.apps, iconStorageKey, iconBuffer, "image/png");
    }

    const version = await prisma.appVersion.create({
      data: {
        id: versionId,
        appId: appRow.id,
        uploadedByUserId: req.user!.userId,
        fileType: "APK",
        storageKey,
        fileName: data.filename,
        fileSizeBytes: BigInt(buffer.length),
        checksumSha256,
        versionName: metadata.versionName,
        versionCode: metadata.versionCode,
        minSdkVersion: metadata.minSdkVersion,
        targetSdkVersion: metadata.targetSdkVersion,
        iconStorageKey,
        status: "SCANNING",
      },
    });

    if (iconStorageKey && !appRow.iconStorageKey) {
      await prisma.app.update({ where: { id: appRow.id }, data: { iconStorageKey } });
    }

    await appProcessingQueue().add("scan", { appVersionId: version.id }, { removeOnComplete: true, removeOnFail: 20 });

    return reply.code(201).send({
      app: appRow,
      version: { ...version, fileSizeBytes: version.fileSizeBytes.toString() },
    });
  });

  app.get("/api/apps/:appId/versions", async (req) => {
    const { appId } = req.params as { appId: string };
    const appRow = await prisma.app.findUnique({ where: { id: appId }, include: { project: true } });
    if (!appRow) throw new NotFoundError("App");
    await requireOrgMembership(req, appRow.project.organizationId);

    const versions = await prisma.appVersion.findMany({ where: { appId }, orderBy: { createdAt: "desc" } });
    return { versions: versions.map((v) => ({ ...v, fileSizeBytes: v.fileSizeBytes.toString() })) };
  });

  app.get("/api/app-versions/:id/download-url", async (req) => {
    const { id } = req.params as { id: string };
    const version = await prisma.appVersion.findUnique({ where: { id }, include: { app: { include: { project: true } } } });
    if (!version) throw new NotFoundError("App version");
    await requireOrgMembership(req, version.app.project.organizationId);
    const url = await presignedGetUrl(BUCKETS.apps, version.storageKey, 900);
    return { url };
  });
}
