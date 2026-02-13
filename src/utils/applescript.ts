import { execFile, spawn, ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 10_000;

export class AppleScriptError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "accessibility_denied"
      | "app_not_running"
      | "element_not_found"
      | "timeout"
      | "unknown",
  ) {
    super(message);
    this.name = "AppleScriptError";
  }
}

function classifyError(stderr: string): AppleScriptError {
  const msg = stderr.trim();

  if (msg.includes("not allowed assistive access") || msg.includes("accessibility")) {
    return new AppleScriptError(
      "Accessibility permission denied. Enable this app in System Settings → Privacy & Security → Accessibility.",
      "accessibility_denied",
    );
  }
  if (msg.includes("application isn't running") || msg.includes("Application isn't running")) {
    return new AppleScriptError(
      `Application is not running. Launch it first with launch_app.`,
      "app_not_running",
    );
  }
  if (msg.includes("Can't get") || msg.includes("doesn't understand")) {
    return new AppleScriptError(
      `Element not found: ${msg}`,
      "element_not_found",
    );
  }

  return new AppleScriptError(msg || "Unknown AppleScript error", "unknown");
}

export function escapeForAppleScript(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

// ── Persistent osascript helper ─────────────────────────────────

const SENTINEL = "__OSASCRIPT_DONE__";
// Use a unique sentinel per request to avoid cross-talk
let requestId = 0;

let osaProcess: ChildProcess | null = null;

function getOsascriptProcess(): ChildProcess {
  if (osaProcess && osaProcess.exitCode === null) {
    return osaProcess;
  }
  // Launch osascript in interactive mode reading from stdin
  // -s s = keep output as human-readable strings
  osaProcess = spawn("osascript", ["-s", "s", "-"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  osaProcess.on("exit", () => {
    osaProcess = null;
  });
  return osaProcess;
}

export async function runAppleScript(script: string): Promise<string> {
  const proc = getOsascriptProcess();
  const id = ++requestId;
  const sentinel = `${SENTINEL}_${id}`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      // Kill and restart the process on timeout
      proc.kill();
      osaProcess = null;
      reject(
        new AppleScriptError(
          "AppleScript timed out after 10 seconds.",
          "timeout",
        ),
      );
    }, TIMEOUT_MS);

    let stdoutBuf = "";
    let stderrBuf = "";

    const onStdout = (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      // Check if we've received our sentinel marker
      const sentinelIdx = stdoutBuf.indexOf(sentinel);
      if (sentinelIdx !== -1) {
        cleanup();
        // Everything before the sentinel is the actual output
        const output = stdoutBuf.slice(0, sentinelIdx).trim();
        if (stderrBuf.trim()) {
          reject(classifyError(stderrBuf));
        } else {
          resolve(output);
        }
      }
    };

    const onStderr = (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    };

    const cleanup = () => {
      clearTimeout(timer);
      proc.stdout?.off("data", onStdout);
      proc.stderr?.off("data", onStderr);
    };

    proc.stdout?.on("data", onStdout);
    proc.stderr?.on("data", onStderr);

    // Send the script followed by a sentinel log so we know when output is done
    const wrappedScript = `${script}\nlog "${sentinel}"\n`;
    proc.stdin?.write(wrappedScript);
  });
}

// Fallback: run with execFile for cases where persistent process doesn't work
export async function runAppleScriptOnce(script: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: TIMEOUT_MS,
    });
    return stdout.trim();
  } catch (err: unknown) {
    const error = err as { killed?: boolean; stderr?: string; message?: string };

    if (error.killed) {
      throw new AppleScriptError(
        "AppleScript timed out after 10 seconds.",
        "timeout",
      );
    }

    const stderr = error.stderr || error.message || "Unknown error";
    throw classifyError(stderr);
  }
}
