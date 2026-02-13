import { execFile, spawn, ChildProcess } from "node:child_process";
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

// ── Persistent Python helper process ────────────────────────────

const HELPER_SCRIPT = `
import sys, json

# Pre-import heavy frameworks once
try:
    import Quartz
except ImportError:
    Quartz = None
try:
    import Vision
    from Foundation import NSURL
except ImportError:
    Vision = None

# Signal ready via stderr (stdout is reserved for JSON responses)
sys.stderr.write("__READY__\\n")
sys.stderr.flush()

# Read-eval loop
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        request = json.loads(line)
        code = request["code"]
        # Capture stdout from exec
        import io
        buf = io.StringIO()
        old_stdout = sys.stdout
        sys.stdout = buf
        exec(code, {"Quartz": Quartz, "Vision": Vision, "NSURL": NSURL if Vision else None, "json": json})
        sys.stdout = old_stdout
        output = buf.getvalue().rstrip("\\n")
        result = {"ok": True, "output": output}
    except Exception as e:
        sys.stdout = sys.__stdout__
        result = {"ok": False, "error": str(e)}
    # Write response to stdout
    sys.__stdout__.write(json.dumps(result) + "\\n")
    sys.__stdout__.flush()
`;

let helperProcess: ChildProcess | null = null;
let helperReady: Promise<void> | null = null;

function startHelper(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(VENV_PYTHON, ["-u", "-c", HELPER_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    helperProcess = proc;

    proc.on("error", (err) => {
      helperProcess = null;
      reject(err);
    });

    proc.on("exit", () => {
      helperProcess = null;
    });

    // Wait for __READY__ signal on stderr
    const onStderr = (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes("__READY__")) {
        proc.stderr?.off("data", onStderr);
        // Switch to forwarding stderr after ready
        proc.stderr?.on("data", (c: Buffer) => {
          console.error(`[python] ${c.toString().trim()}`);
        });
        resolve();
      }
    };
    proc.stderr?.on("data", onStderr);
  });
}

async function getHelper(): Promise<ChildProcess> {
  if (helperProcess && helperProcess.exitCode === null) {
    return helperProcess;
  }
  helperReady = startHelper();
  await helperReady;
  return helperProcess!;
}

export async function runPython(
  code: string,
  timeout = 15_000,
): Promise<string> {
  const proc = await getHelper();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Python execution timed out"));
    }, timeout);

    let buf = "";

    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      // Response is newline-delimited JSON — only try parsing once we have a full line
      const nlIdx = buf.indexOf("\n");
      if (nlIdx === -1) return;

      const line = buf.slice(0, nlIdx);
      try {
        const result = JSON.parse(line);
        cleanup();
        if (result.ok) {
          resolve(result.output);
        } else {
          reject(new Error(result.error));
        }
      } catch {
        // Malformed JSON on a complete line — discard and keep waiting
        buf = buf.slice(nlIdx + 1);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      proc.stdout?.off("data", onData);
    };

    proc.stdout?.on("data", onData);
    proc.stdin?.write(JSON.stringify({ code }) + "\n");
  });
}

export { VENV_PYTHON };

/** Pre-start the helper so first Python call doesn't pay startup cost */
export async function warmupPythonHelper(): Promise<void> {
  try {
    await getHelper();
  } catch {
    // Non-fatal — helper will start on first use
  }
}
