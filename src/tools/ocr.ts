import { runAppleScript, escapeForAppleScript } from "../utils/applescript.js";
import { runPython } from "../utils/python.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

interface OCRElement {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  confidence: number;
}

export async function screenOCR(app?: string): Promise<string> {
  const tmpPath = `/tmp/mcp-ocr-${randomUUID()}.png`;

  // We need the screen/window dimensions to convert normalized coords to pixels
  let screenWidth: number;
  let screenHeight: number;
  let offsetX = 0;
  let offsetY = 0;

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
      const [x, y, w, h] = bounds.split(",").map(Number);
      offsetX = x;
      offsetY = y;
      screenWidth = w;
      screenHeight = h;
      await execFileAsync("screencapture", ["-R", bounds, "-x", tmpPath]);
    } else {
      // Get screen dimensions
      const dimScript = `tell application "Finder" to get bounds of window of desktop`;
      try {
        const dims = await runAppleScript(dimScript);
        const parts = dims.split(", ").map(Number);
        screenWidth = parts[2];
        screenHeight = parts[3];
      } catch {
        // Fallback: use system_profiler
        const { stdout } = await execFileAsync("python3", [
          "-c",
          "from AppKit import NSScreen; f=NSScreen.mainScreen().frame(); print(f'{int(f.size.width)},{int(f.size.height)}')",
        ]).catch(() => ({ stdout: "1920,1080" }));
        const [w, h] = stdout.trim().split(",").map(Number);
        screenWidth = w;
        screenHeight = h;
      }
      await execFileAsync("screencapture", ["-x", tmpPath]);
    }

    // OCR with bounding boxes using Vision framework
    // tmpPath is generated internally via randomUUID — not user input
    const ocrResult = await runPython(`
import Vision
import json
from Foundation import NSURL

url = NSURL.fileURLWithPath_("${tmpPath}")
request = Vision.VNRecognizeTextRequest.alloc().init()
request.setRecognitionLevel_(1)  # accurate
request.setUsesLanguageCorrection_(True)
handler = Vision.VNImageRequestHandler.alloc().initWithURL_options_(url, None)
success = handler.performRequests_error_([request], None)

results = []
for obs in request.results():
    candidate = obs.topCandidates_(1)[0]
    text = candidate.string()
    confidence = obs.confidence()
    box = obs.boundingBox()

    # Vision returns normalized coords (0-1) with origin at bottom-left
    # Convert to top-left origin pixel coords
    x = box.origin.x
    y = 1.0 - box.origin.y - box.size.height  # flip Y
    w = box.size.width
    h = box.size.height

    results.append({
        "text": text,
        "nx": round(x, 4),
        "ny": round(y, 4),
        "nw": round(w, 4),
        "nh": round(h, 4),
        "confidence": round(confidence, 3)
    })

print(json.dumps(results))
`);

    const rawElements = JSON.parse(ocrResult) as Array<{
      text: string;
      nx: number;
      ny: number;
      nw: number;
      nh: number;
      confidence: number;
    }>;

    // Convert normalized coordinates to screen pixel coordinates
    const elements: OCRElement[] = rawElements.map((el) => {
      const x = Math.round(el.nx * screenWidth) + offsetX;
      const y = Math.round(el.ny * screenHeight) + offsetY;
      const width = Math.round(el.nw * screenWidth);
      const height = Math.round(el.nh * screenHeight);

      return {
        text: el.text,
        x,
        y,
        width,
        height,
        centerX: x + Math.round(width / 2),
        centerY: y + Math.round(height / 2),
        confidence: el.confidence,
      };
    });

    // Sort top-to-bottom, left-to-right
    elements.sort((a, b) => a.y === b.y ? a.x - b.x : a.y - b.y);

    return JSON.stringify(
      {
        app: app || "full screen",
        elementCount: elements.length,
        screenRegion: { x: offsetX, y: offsetY, width: screenWidth, height: screenHeight },
        elements,
      },
      null,
      2,
    );
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

export async function findTextOnScreen(
  text: string,
  app?: string,
): Promise<string> {
  const fullResult = await screenOCR(app);
  const parsed = JSON.parse(fullResult);
  const textLower = text.toLowerCase();

  const matches = parsed.elements.filter((el: OCRElement) =>
    el.text.toLowerCase().includes(textLower),
  );

  if (matches.length === 0) {
    return JSON.stringify({
      query: text,
      found: false,
      message: `"${text}" not found on screen. Available text: ${parsed.elements.map((e: OCRElement) => e.text).slice(0, 20).join(", ")}`,
    });
  }

  return JSON.stringify(
    {
      query: text,
      found: true,
      matchCount: matches.length,
      matches: matches.map((m: OCRElement) => ({
        text: m.text,
        clickX: m.centerX,
        clickY: m.centerY,
        bounds: { x: m.x, y: m.y, width: m.width, height: m.height },
        confidence: m.confidence,
      })),
      hint: "Use click_at(clickX, clickY) to click on any match.",
    },
    null,
    2,
  );
}
