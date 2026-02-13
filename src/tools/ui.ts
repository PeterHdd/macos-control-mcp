import { runAppleScript, escapeForAppleScript } from "../utils/applescript.js";
import { captureScreenshot } from "../utils/screenshot.js";

const MAX_ELEMENTS = 200;

interface UIElement {
  role: string;
  name: string;
  position: string;
}

export async function getUIElements(app: string): Promise<string> {
  const safeApp = escapeForAppleScript(app);
  const script = `
tell application "System Events"
  tell process "${safeApp}"
    set output to ""
    set elems to every UI element of window 1
    repeat with e in elems
      try
        set r to role of e
        set n to name of e
        set d to description of e
        set p to position of e
        set output to output & r & "|||" & n & "|||" & d & "|||" & (item 1 of p as text) & "," & (item 2 of p as text) & "\\n"
      end try
    end repeat
    return output
  end tell
end tell`;

  const raw = await runAppleScript(script);
  const lines = raw.split("\n").filter(Boolean);
  const elements: UIElement[] = [];

  for (const line of lines.slice(0, MAX_ELEMENTS)) {
    const parts = line.split("|||");
    if (parts.length >= 4) {
      elements.push({
        role: parts[0],
        name: parts[1] || parts[2], // fall back to description if name empty
        position: parts[3],
      });
    }
  }

  const result = {
    app,
    elementCount: elements.length,
    truncated: lines.length > MAX_ELEMENTS,
    elements,
  };
  return JSON.stringify(result, null, 2);
}

// Overloads: without skipScreenshot, screenshot is always present
export async function clickElement(
  app: string,
  elementName: string,
): Promise<{ text: string; screenshot: { base64: string; mimeType: string } }>;
export async function clickElement(
  app: string,
  elementName: string,
  options: { skipScreenshot: true },
): Promise<{ text: string }>;
export async function clickElement(
  app: string,
  elementName: string,
  options?: { skipScreenshot?: boolean },
): Promise<{ text: string; screenshot?: { base64: string; mimeType: string } }> {
  const safeApp = escapeForAppleScript(app);
  const safeName = escapeForAppleScript(elementName);

  // Single-pass: try direct types first, then deep search — all in one osascript call
  const script = `
tell application "System Events"
  tell process "${safeApp}"
    -- Direct click on common UI element types
    try
      click button "${safeName}" of window 1
      return "clicked"
    end try
    try
      click menu button "${safeName}" of window 1
      return "clicked"
    end try
    try
      click checkbox "${safeName}" of window 1
      return "clicked"
    end try
    try
      click radio button "${safeName}" of window 1
      return "clicked"
    end try
    try
      click static text "${safeName}" of window 1
      return "clicked"
    end try
    -- Deep search: generic UI element match
    try
      click (first UI element whose name is "${safeName}") of window 1
      return "clicked"
    end try
    -- Search inside groups
    set grps to every group of window 1
    repeat with g in grps
      try
        click button "${safeName}" of g
        return "clicked"
      end try
      try
        click (first UI element whose name is "${safeName}") of g
        return "clicked"
      end try
    end repeat
    -- Search inside toolbar
    try
      set tb to toolbar 1 of window 1
      click button "${safeName}" of tb
      return "clicked"
    end try
    try
      set tb to toolbar 1 of window 1
      click (first UI element whose name is "${safeName}") of tb
      return "clicked"
    end try
    return "not_found"
  end tell
end tell`;

  const result = await runAppleScript(script);

  if (result === "not_found") {
    throw new Error(
      `Could not find element "${elementName}" in "${app}". Use get_ui_elements to see available elements.`,
    );
  }

  const text = `Clicked "${elementName}" in "${app}".`;

  if (options?.skipScreenshot) {
    return { text };
  }

  // Small delay for UI to update, then screenshot
  await new Promise((r) => setTimeout(r, 100));
  const screenshot = await captureScreenshot(app);
  return { text, screenshot };
}
