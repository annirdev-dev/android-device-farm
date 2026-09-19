import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface ApkMetadata {
  packageName: string;
  appName?: string;
  versionName?: string;
  versionCode?: number;
  minSdkVersion?: number;
  targetSdkVersion?: number;
  iconBase64?: string; // data URI, if the manifest embeds one app-info-parser could decode
}

const APK_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04" - all APKs are ZIP archives

export function isLikelyApk(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer.subarray(0, 4).equals(APK_MAGIC);
}

/**
 * Extracts package name / version / SDK levels / icon from an uploaded APK.
 * Uses `app-info-parser`, which reads the binary AndroidManifest.xml and
 * resources.arsc directly - no Android SDK required at parse time.
 */
export async function parseApkMetadata(buffer: Buffer): Promise<ApkMetadata> {
  if (!isLikelyApk(buffer)) {
    throw new Error("File does not look like a valid APK (missing ZIP magic bytes)");
  }

  const tmpPath = path.join(os.tmpdir(), `devicefarm-upload-${randomUUID()}.apk`);
  await fs.writeFile(tmpPath, buffer);

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ApkParser = require("app-info-parser/src/apk");
    const parser = new ApkParser(tmpPath);
    const result = await parser.parse();

    // app-info-parser puts manifest fields directly on the result object
    // (result.package, result.versionCode, ...), not nested under a
    // "manifest" key - confirmed against a real APK (io.appium.android.apis).
    const versionCode = Number(result.versionCode);
    const usesSdk = result.usesSdk ?? {};
    const rawLabel = result.application?.label;
    const appName = Array.isArray(rawLabel) ? rawLabel[0] : rawLabel;

    return {
      packageName: String(result.package ?? ""),
      appName: typeof appName === "string" ? appName : undefined,
      versionName: result.versionName ? String(result.versionName) : undefined,
      versionCode: Number.isFinite(versionCode) ? versionCode : undefined,
      minSdkVersion: usesSdk.minSdkVersion ? Number(usesSdk.minSdkVersion) : undefined,
      targetSdkVersion: usesSdk.targetSdkVersion ? Number(usesSdk.targetSdkVersion) : undefined,
      iconBase64: typeof result.icon === "string" ? result.icon : undefined,
    };
  } finally {
    await fs.unlink(tmpPath).catch(() => undefined);
  }
}
