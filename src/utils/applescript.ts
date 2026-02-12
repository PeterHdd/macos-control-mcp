import { execFile } from "node:child_process";
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

export async function runAppleScript(script: string): Promise<string> {
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
