import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { runAppleScript, escapeForAppleScript } from "./applescript.js";

const execFileAsync = promisify(execFile);

export async function captureScreenshot(
  app?: string,
): Promise<{ base64: string; mimeType: string }> {
  const tmpPath = `/tmp/mcp-screenshot-${randomUUID()}.png`;

  try {
    if (app) {
      const safeApp = escapeForAppleScript(app);
      // Get window bounds via System Events
      const boundsScript = `
tell application "System Events"
  tell process "${safeApp}"
    set winPos to position of window 1
    set winSize to size of window 1
    set x to item 1 of winPos
    set y to item 2 of winPos
    set w to item 1 of winSize
    set h to item 2 of winSize
    return (x as text) & "," & (y as text) & "," & (w as text) & "," & (h as text)
  end tell
end tell`;
      const bounds = await runAppleScript(boundsScript);
      await execFileAsync("screencapture", ["-R", bounds, "-x", tmpPath]);
    } else {
      await execFileAsync("screencapture", ["-x", tmpPath]);
    }

    const buffer = await readFile(tmpPath);
    return { base64: buffer.toString("base64"), mimeType: "image/png" };
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
