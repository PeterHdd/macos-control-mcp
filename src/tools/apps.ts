import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runAppleScript, escapeForAppleScript } from "../utils/applescript.js";

const execFileAsync = promisify(execFile);

async function openApp(name: string): Promise<void> {
  await execFileAsync("open", ["-a", name]);
}

export async function launchApp(name: string): Promise<string> {
  const safe = escapeForAppleScript(name);
  const wasRunning = await runAppleScript(
    `tell application "System Events" to (name of every application process whose background only is false) contains "${safe}"`,
  );
  await openApp(name);
  if (wasRunning.trim() === "true") {
    return `Activated "${name}" (was already running).`;
  }
  return `Launched "${name}" (freshly opened). Note: document-based apps like TextEdit and Notes auto-create a new document on launch, so Cmd+N is not needed.`;
}

export async function quitApp(name: string): Promise<string> {
  const safe = escapeForAppleScript(name);
  await runAppleScript(`tell application "${safe}" to quit`);
  return `Quit "${name}".`;
}

export async function focusApp(name: string): Promise<string> {
  await openApp(name);
  return `Focused "${name}".`;
}

export async function listRunningApps(): Promise<string> {
  const raw = await runAppleScript(
    `tell application "System Events" to get name of every application process whose background only is false`,
  );
  // AppleScript returns comma-separated list
  const apps = raw.split(", ").map((s) => s.trim()).filter(Boolean);
  return JSON.stringify(apps, null, 2);
}
