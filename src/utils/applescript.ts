import { spawn } from "node:child_process";

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

export async function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("osascript", ["-s", "s"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      proc.kill();
      reject(
        new AppleScriptError(
          "AppleScript timed out after 10 seconds.",
          "timeout",
        ),
      );
    }, TIMEOUT_MS);

    let stdoutBuf = "";
    let stderrBuf = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    proc.on("close", () => {
      clearTimeout(timer);
      const output = stdoutBuf.trim();
      const errOutput = stderrBuf.trim();
      if (errOutput) {
        reject(classifyError(errOutput));
      } else {
        resolve(output);
      }
    });

    proc.stdin.write(script);
    proc.stdin.end();
  });
}
