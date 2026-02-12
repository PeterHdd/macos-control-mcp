#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getScreenState } from "./tools/screen.js";
import { screenOCR, findTextOnScreen } from "./tools/ocr.js";
import { clickAt, doubleClickAt, scroll } from "./tools/mouse.js";
import { typeText, pressKey } from "./tools/input.js";
import { launchApp, listRunningApps } from "./tools/apps.js";
import { getUIElements, clickElement } from "./tools/ui.js";
import { openUrl } from "./tools/browser.js";
import { getClipboard, setClipboard } from "./tools/clipboard.js";
import { ensurePythonVenv } from "./utils/python.js";

const server = new McpServer({
  name: "macos-control",
  version: "0.0.3",
});

// ── See the screen ──────────────────────────────────────────────

server.tool(
  "screenshot",
  "Capture a screenshot of the entire screen or a specific app window. Returns a PNG image.",
  { app: z.string().optional().describe("App name to capture. Omit for full screen.") },
  async ({ app }) => {
    try {
      const { base64, mimeType } = await getScreenState(app);
      return { content: [{ type: "image", data: base64, mimeType }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "screen_ocr",
  "OCR the screen using Apple Vision. Returns every text element with pixel coordinates (x, y, centerX, centerY). Use centerX/centerY with click_at to click on any text.",
  { app: z.string().optional().describe("App to OCR. Omit for full screen.") },
  async ({ app }) => {
    try {
      const result = await screenOCR(app);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "find_text_on_screen",
  "Find specific text on screen and get its clickable coordinates. Like Ctrl+F for the entire screen. Returns matches with centerX/centerY for use with click_at.",
  {
    text: z.string().describe("Text to find (case-insensitive)"),
    app: z.string().optional().describe("App to search in. Omit for full screen."),
  },
  async ({ text, app }) => {
    try {
      const result = await findTextOnScreen(text, app);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

// ── Interact with the screen ────────────────────────────────────

server.tool(
  "click_at",
  "Click at x,y screen coordinates. Returns a screenshot after clicking. Use screenshot + screen_ocr to find coordinates first.",
  {
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
  },
  async ({ x, y }) => {
    try {
      const { text, screenshot } = await clickAt(x, y);
      return {
        content: [
          { type: "text", text },
          { type: "image", data: screenshot.base64, mimeType: screenshot.mimeType },
        ],
      };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "double_click_at",
  "Double-click at x,y screen coordinates. Returns a screenshot after clicking.",
  {
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
  },
  async ({ x, y }) => {
    try {
      const { text, screenshot } = await doubleClickAt(x, y);
      return {
        content: [
          { type: "text", text },
          { type: "image", data: screenshot.base64, mimeType: screenshot.mimeType },
        ],
      };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "type_text",
  "Type text into the frontmost app using keyboard input.",
  { text: z.string().describe("Text to type") },
  async ({ text }) => {
    try {
      const result = await typeText(text);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "press_key",
  "Press a key combo (e.g. press 's' with ['command'] for Cmd+S). Supports a-z, 0-9, return, tab, space, delete, escape, arrows, f1-f12.",
  {
    key: z.string().describe("Key name: a-z, 0-9, return, tab, space, delete, escape, up/down/left/right, f1-f12"),
    modifiers: z
      .array(z.string())
      .optional()
      .describe("Modifier keys: 'command', 'shift', 'option', 'control'"),
  },
  async ({ key, modifiers }) => {
    try {
      const result = await pressKey(key, modifiers);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "scroll",
  "Scroll in the frontmost application.",
  {
    direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction"),
    amount: z.number().default(3).describe("Number of lines to scroll (default 3)"),
  },
  async ({ direction, amount }) => {
    try {
      const result = await scroll(direction, amount);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

// ── App management ──────────────────────────────────────────────

server.tool(
  "launch_app",
  "Open or focus a macOS application by name.",
  { name: z.string().describe("Application name, e.g. 'Safari', 'Notes'") },
  async ({ name }) => {
    try {
      const text = await launchApp(name);
      return { content: [{ type: "text", text }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "list_running_apps",
  "List all visible running macOS applications.",
  async () => {
    try {
      const text = await listRunningApps();
      return { content: [{ type: "text", text }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

// ── Accessibility tree ──────────────────────────────────────────

server.tool(
  "get_ui_elements",
  "Get the accessibility tree of an app window. Returns UI element roles, names, and positions.",
  { app: z.string().describe("Application process name") },
  async ({ app }) => {
    try {
      const text = await getUIElements(app);
      return { content: [{ type: "text", text }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "click_element",
  "Click a named UI element in an app window. Returns a screenshot after clicking. Use get_ui_elements to discover element names.",
  {
    app: z.string().describe("Application process name"),
    name: z.string().describe("Name of the UI element to click"),
  },
  async ({ app, name }) => {
    try {
      const { text, screenshot } = await clickElement(app, name);
      return {
        content: [
          { type: "text", text },
          { type: "image", data: screenshot.base64, mimeType: screenshot.mimeType },
        ],
      };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

// ── Utilities ───────────────────────────────────────────────────

server.tool(
  "open_url",
  "Open a URL in Safari or Chrome.",
  {
    url: z.string().describe("URL to open"),
    browser: z.string().optional().describe("'safari' or 'chrome' (defaults to Safari)"),
  },
  async ({ url, browser }) => {
    try {
      const result = await openUrl(url, browser);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "get_clipboard",
  "Read the current text contents of the macOS clipboard.",
  async () => {
    try {
      const text = await getClipboard();
      return { content: [{ type: "text", text }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "set_clipboard",
  "Write text to the macOS clipboard.",
  { text: z.string().describe("Text to copy to clipboard") },
  async ({ text }) => {
    try {
      const result = await setClipboard(text);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

// ── Start server ────────────────────────────────────────────────

async function main() {
  await ensurePythonVenv();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
