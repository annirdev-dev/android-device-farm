import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface ActiveRecording {
  recordingId: string;
  ffmpeg: ChildProcessWithoutNullStreams;
  outputPath: string;
  captureTimer: ReturnType<typeof setInterval>;
  frameCount: number;
  startedAt: number;
}

const active = new Map<string, ActiveRecording>();
const FPS = 2; // deliberately low: this is a screenshot-polling recorder, not a video pipeline (see docs/ROADMAP.md for the WebRTC/H.264 upgrade path)

/**
 * Records a session by polling the worker's screenshot endpoint at a fixed
 * rate and piping PNG frames into ffmpeg's `image2pipe` demuxer. Works with
 * the real provider's PNG frames; the mock provider's SVG frames are skipped
 * with a clear log line rather than silently producing a broken video.
 */
export function startRecording(recordingId: string, captureFrame: () => Promise<{ buffer: Buffer; contentType: string }>): void {
  const outputPath = path.join(os.tmpdir(), `devicefarm-recording-${recordingId}.mp4`);
  const ffmpeg = spawn("ffmpeg", [
    "-y",
    "-f",
    "image2pipe",
    "-framerate",
    String(FPS),
    "-i",
    "-",
    "-vcodec",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);

  const record: ActiveRecording = { recordingId, ffmpeg, outputPath, frameCount: 0, startedAt: Date.now(), captureTimer: undefined as never };

  ffmpeg.on("error", (err) => {
    console.error(`ffmpeg not available or failed for recording ${recordingId}:`, err.message);
  });

  record.captureTimer = setInterval(async () => {
    try {
      const { buffer, contentType } = await captureFrame();
      if (contentType !== "image/png") return; // mock provider frames (SVG) aren't a supported ffmpeg input here
      if (!ffmpeg.stdin.destroyed) {
        ffmpeg.stdin.write(buffer);
        record.frameCount += 1;
      }
    } catch {
      // transient capture failure; skip this frame
    }
  }, 1000 / FPS);

  active.set(recordingId, record);
}

export async function stopRecording(recordingId: string): Promise<{ durationSeconds: number; filePath: string; fileSizeBytes: number } | null> {
  const record = active.get(recordingId);
  if (!record) return null;
  clearInterval(record.captureTimer);
  active.delete(recordingId);

  await new Promise<void>((resolve) => {
    record.ffmpeg.once("close", () => resolve());
    record.ffmpeg.stdin.end();
    setTimeout(resolve, 5000); // don't hang forever if ffmpeg wedges
  });

  const durationSeconds = Math.round((Date.now() - record.startedAt) / 1000);
  const exists = fs.existsSync(record.outputPath);
  const fileSizeBytes = exists ? fs.statSync(record.outputPath).size : 0;
  return { durationSeconds, filePath: record.outputPath, fileSizeBytes };
}

export function isRecordingActive(recordingId: string): boolean {
  return active.has(recordingId);
}
