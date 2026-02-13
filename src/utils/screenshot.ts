import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { runAppleScript, escapeForAppleScript } from "./applescript.js";

const execFileAsync = promisify(execFile);

export async function captureScreenshot(
  app?: string,
): Promise<{ base64: string; mimeType: string }> {
  const tmpPath = `/tmp/mcp-screenshot-${randomUUID()}.jpg`;

  try {
    if (app) {
      const safeApp = escapeForAppleScript(app);
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
      // Validate bounds format: "x,y,w,h" with numeric values and positive dimensions
      const parts = bounds.split(",").map((p) => p.trim());
      const nums = parts.map(Number);
      if (
        parts.length === 4 &&
        nums.every((n) => !isNaN(n)) &&
        nums[2] > 0 &&
        nums[3] > 0
      ) {
        await execFileAsync("screencapture", [
          "-R", nums.join(","), "-x", "-t", "jpg", tmpPath,
        ]);
      } else {
        // Invalid bounds — fall back to full-screen capture
        await execFileAsync("screencapture", ["-x", "-t", "jpg", tmpPath]);
      }
    } else {
      await execFileAsync("screencapture", ["-x", "-t", "jpg", tmpPath]);
    }

    // Resize to keep context size manageable — sips in-place on JPEG (no format conversion needed)
    await execFileAsync("sips", [
      "--resampleWidth", "1024",
      "--setProperty", "formatOptions", "60",
      tmpPath,
    ]);

    const buffer = await readFile(tmpPath);
    return { base64: buffer.toString("base64"), mimeType: "image/jpeg" };
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
