import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { loadEnv } from "@devicefarm/config";

let client: S3Client | undefined;

export function s3(): S3Client {
  if (client) return client;
  const env = loadEnv();
  client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

export const BUCKETS = {
  get apps() {
    return loadEnv().S3_BUCKET_APPS;
  },
  get screenshots() {
    return loadEnv().S3_BUCKET_SCREENSHOTS;
  },
  get recordings() {
    return loadEnv().S3_BUCKET_RECORDINGS;
  },
};

export async function ensureBucketsExist(): Promise<void> {
  for (const bucket of [BUCKETS.apps, BUCKETS.screenshots, BUCKETS.recordings]) {
    try {
      await s3().send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await s3().send(new CreateBucketCommand({ Bucket: bucket })).catch(() => undefined);
    }
  }
}

export async function uploadObject(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function downloadObject(bucket: string, key: string): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function presignedGetUrl(bucket: string, key: string, expiresInSeconds = 900): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSeconds });
}

export async function presignedPutUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresInSeconds = 900,
): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds },
  );
}

export function objectKeyForAppVersion(appId: string, versionId: string, fileName: string): string {
  return `apps/${appId}/versions/${versionId}/${fileName}`;
}

export function objectKeyForScreenshot(sessionId: string, screenshotId: string): string {
  return `sessions/${sessionId}/screenshots/${screenshotId}.png`;
}

export function objectKeyForRecording(sessionId: string, recordingId: string): string {
  return `sessions/${sessionId}/recordings/${recordingId}.mp4`;
}
