import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { access, mkdir } from "node:fs/promises";

const execFileAsync = promisify(execFile);

const VENV_DIR = resolve(homedir(), ".macos-control-mcp", ".venv");
const VENV_PYTHON = resolve(VENV_DIR, "bin", "python3");

const PACKAGES = [
  "pyobjc-framework-Vision",
  "pyobjc-framework-Quartz",
];

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensurePythonVenv(): Promise<void> {
  if (await fileExists(VENV_PYTHON)) return;

  console.error("[macos-control-mcp] Setting up Python environment (first run only)...");

  // Find system python3
  let python: string;
  try {
    const { stdout } = await execFileAsync("which", ["python3"]);
    python = stdout.trim();
  } catch {
    console.error("[macos-control-mcp] Python 3 not found. OCR and mouse tools require Python 3.9+.");
    console.error("[macos-control-mcp] Non-Python tools (keyboard, apps, clipboard) will still work.");
    return;
  }

  try {
    await mkdir(resolve(homedir(), ".macos-control-mcp"), { recursive: true });
    console.error("[macos-control-mcp] Creating venv...");
    await execFileAsync(python, ["-m", "venv", VENV_DIR], { timeout: 30_000 });

    console.error("[macos-control-mcp] Installing dependencies (this may take a minute)...");
    const pip = resolve(VENV_DIR, "bin", "pip");
    await execFileAsync(pip, ["install", ...PACKAGES], { timeout: 300_000 });

    console.error("[macos-control-mcp] Python environment ready.");
  } catch (err) {
    console.error(`[macos-control-mcp] Failed to set up Python: ${err}`);
    console.error("[macos-control-mcp] Non-Python tools will still work.");
  }
}

export async function runPython(
  code: string,
  timeout = 15_000,
): Promise<string> {
  const { stdout } = await execFileAsync(VENV_PYTHON, ["-c", code], {
    timeout,
  });
  return stdout.trim();
}

export { VENV_PYTHON };
