import { spawn } from "node:child_process";
import path from "node:path";
import { loadEnv } from "@devicefarm/config";

/**
 * Thin, injection-safe wrappers around the `adb` and `emulator` CLIs.
 *
 * Every call here uses `spawn(cmd, argsArray)` - never a shell string - so
 * user-controlled values (typed text, app package names) can never break out
 * into a shell command on the *host*. `adb shell <args>` still concatenates
 * its trailing args into one command string that the *device's* shell
 * parses, so anything forwarded through `shell` is additionally escaped with
 * `shellQuoteForDevice` before being handed to adb.
 */

export function sdkPaths() {
  const env = loadEnv();
  const root = env.ANDROID_SDK_ROOT;
  return {
    root,
    adb: path.join(root, "platform-tools", "adb"),
    emulator: path.join(root, "emulator", "emulator"),
    avdmanager: path.join(root, "cmdline-tools", "latest", "bin", "avdmanager"),
    sdkmanager: path.join(root, "cmdline-tools", "latest", "bin", "sdkmanager"),
  };
}

export interface RunOptions {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  input?: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...opts.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const stdoutChunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`Command timed out after ${opts.timeoutMs}ms: ${cmd} ${args.join(" ")}`));
        }, opts.timeoutMs)
      : undefined;

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });

    if (opts.input) {
      child.stdin.write(opts.input);
    }
    child.stdin.end();

    // Expose raw stdout bytes for binary output (screencap) via a side channel.
    (child as unknown as { __stdoutChunks: Buffer[] }).__stdoutChunks = stdoutChunks;
  });
}

/** Same as `run`, but returns raw stdout bytes instead of decoding as utf8 - required for `screencap`. */
export function runBinary(cmd: string, args: string[], opts: RunOptions = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...opts.env } });
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`Command timed out: ${cmd} ${args.join(" ")}`));
        }, opts.timeoutMs)
      : undefined;
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${cmd} exited with ${code}: ${stderr}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

export function adb(serial: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return run(sdkPaths().adb, ["-s", serial, ...args], opts);
}

export function adbBinary(serial: string, args: string[], opts: RunOptions = {}): Promise<Buffer> {
  return runBinary(sdkPaths().adb, ["-s", serial, ...args], opts);
}

/** Escapes a string for safe inclusion inside the *device-side* shell command that `adb shell` sends. */
export function shellQuoteForDevice(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** `input text` on-device only understands `%s` for a literal space. */
export function encodeForInputText(text: string): string {
  const escaped = text.replace(/[\\'"$`]/g, (ch) => `\\${ch}`).replace(/ /g, "%s");
  return escaped;
}

const PACKAGE_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export function assertValidPackageName(packageName: string): void {
  if (!PACKAGE_NAME_RE.test(packageName)) {
    throw new Error(`Refusing to use invalid Android package name: ${packageName}`);
  }
}

export interface LongRunningProcess {
  kill(): void;
  onExit(cb: (code: number | null) => void): void;
}

/** Spawns a long-lived process (the emulator binary, or `adb logcat`) whose stdout is streamed line by line. */
export function spawnStreaming(
  cmd: string,
  args: string[],
  onLine: (line: string, stream: "stdout" | "stderr") => void,
  opts: { env?: NodeJS.ProcessEnv } = {},
): LongRunningProcess {
  const child = spawn(cmd, args, { env: { ...process.env, ...opts.env } });
  let stdoutBuf = "";
  let stderrBuf = "";

  const drain = (buf: string, stream: "stdout" | "stderr") => {
    const parts = buf.split("\n");
    const remainder = parts.pop() ?? "";
    for (const line of parts) onLine(line, stream);
    return remainder;
  };

  child.stdout.on("data", (c: Buffer) => {
    stdoutBuf = drain(stdoutBuf + c.toString("utf8"), "stdout");
  });
  child.stderr.on("data", (c: Buffer) => {
    stderrBuf = drain(stderrBuf + c.toString("utf8"), "stderr");
  });

  const exitCallbacks: Array<(code: number | null) => void> = [];
  child.on("close", (code) => exitCallbacks.forEach((cb) => cb(code)));

  return {
    kill: () => child.kill("SIGTERM"),
    onExit: (cb) => exitCallbacks.push(cb),
  };
}

/** Deterministic-ish free console-port allocator (Android emulator wants even ports, 5554-5682). */
const usedPorts = new Set<number>();
export function allocateConsolePort(): number {
  for (let port = 5554; port <= 5682; port += 2) {
    if (!usedPorts.has(port)) {
      usedPorts.add(port);
      return port;
    }
  }
  throw new Error("No free emulator console ports available on this host (max concurrency reached)");
}
export function releaseConsolePort(port: number): void {
  usedPorts.delete(port);
}
