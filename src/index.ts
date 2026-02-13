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
import { executeJavaScript, getPageText, getPageElements, clickByText, fillByLabel, selectOption } from "./tools/webjs.js";
import { batchActions } from "./tools/batch.js";
import { ensurePythonVenv, warmupPythonHelper } from "./utils/python.js";

const server = new McpServer({
  name: "macos-control",
  version: "0.0.11",
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
  "Click at x,y screen coordinates. Returns a screenshot after clicking. Use screenshot + screen_ocr to find coordinates first. Prefer batch_actions when combining with other actions.",
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
  "Double-click at x,y screen coordinates. Returns a screenshot after clicking. Prefer batch_actions when combining with other actions.",
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
  "Type text using keyboard input. If app is specified, focuses that app first to ensure keystrokes go to the right place. Without app, types into the frontmost app. Prefer batch_actions when combining with other actions.",
  {
    text: z.string().describe("Text to type"),
    app: z.string().optional().describe("App to focus before typing (e.g. 'Google Chrome', 'Notes'). Recommended to avoid keystrokes going to the wrong app."),
  },
  async ({ text, app }) => {
    try {
      const result = await typeText(text, app);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "press_key",
  "Press a key combo (e.g. press 's' with ['command'] for Cmd+S). Supports a-z, 0-9, return, tab, space, delete, escape, arrows, f1-f12. If app is specified, focuses that app first. Prefer batch_actions when combining with other actions.",
  {
    key: z.string().describe("Key name: a-z, 0-9, return, tab, space, delete, escape, up/down/left/right, f1-f12"),
    modifiers: z
      .array(z.string())
      .optional()
      .describe("Modifier keys: 'command', 'shift', 'option', 'control'"),
    app: z.string().optional().describe("App to focus before pressing key (e.g. 'Google Chrome', 'Notes')."),
  },
  async ({ key, modifiers, app }) => {
    try {
      const result = await pressKey(key, modifiers, app);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "scroll",
  "Scroll in the frontmost application. Prefer batch_actions when combining with other actions.",
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
  "Open or focus a macOS application by name. Prefer batch_actions when combining with other actions.",
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
  "Click a named UI element in an app window. Returns a screenshot after clicking. Use get_ui_elements to discover element names. Prefer batch_actions when combining with other actions.",
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

// ── Browser automation ───────────────────────────────────────────

server.tool(
  "execute_javascript",
  "Run JavaScript in the active browser tab. Much faster than screenshot+OCR for web pages. Returns the result.",
  {
    code: z.string().describe("JavaScript code to execute"),
    browser: z.string().optional().describe("'safari' or 'chrome' (defaults to Safari)"),
  },
  async ({ code, browser }) => {
    try {
      const result = await executeJavaScript(code, browser);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "get_page_text",
  "Get all visible text from the current browser page. Faster than OCR for web content.",
  { browser: z.string().optional().describe("'safari' or 'chrome' (defaults to Safari)") },
  async ({ browser }) => {
    try {
      const result = await getPageText(browser);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "get_page_elements",
  "Get all interactive elements (buttons, inputs, selects, radios, checkboxes, links) from the current browser page. Returns structured text showing each element's type, label, value, and state. Use this instead of screenshot+OCR to understand web page content. Then use click_by_text or fill_by_label to interact.",
  { browser: z.string().optional().describe("'safari' or 'chrome' (defaults to Safari)") },
  async ({ browser }) => {
    try {
      const result = await getPageElements(browser);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "click_by_text",
  "Click a button, link, tab, radio, or checkbox by its visible text. Much more reliable than coordinate clicking. Scrolls element into view before clicking.",
  {
    text: z.string().describe("Visible text to search for (case-insensitive partial match)"),
    element_type: z.enum(["button", "link", "tab", "radio", "checkbox", "any"]).optional().describe("Type of element to click (default: 'any')"),
    index: z.number().optional().describe("Which match to click if multiple found (0-based, default: 0)"),
    browser: z.string().optional().describe("'safari' or 'chrome' (defaults to Safari)"),
  },
  async ({ text, element_type, index, browser }) => {
    try {
      const result = await clickByText(text, element_type, index, browser);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "fill_by_label",
  "Fill a form field by its label text. Finds the input/textarea associated with the label and fills it. Works with React/Vue/Angular apps. On failure, lists available field labels for debugging.",
  {
    label: z.string().describe("Label text of the field (case-insensitive partial match)"),
    value: z.string().describe("Value to fill in"),
    browser: z.string().optional().describe("'safari' or 'chrome' (defaults to Safari)"),
  },
  async ({ label, value, browser }) => {
    try {
      const result = await fillByLabel(label, value, browser);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

server.tool(
  "select_option",
  "Select a dropdown option by the dropdown's label and the option text. On failure, lists available options for debugging.",
  {
    label: z.string().describe("Label text of the select/dropdown (case-insensitive partial match)"),
    option: z.string().describe("Option text to select (case-insensitive partial match)"),
    browser: z.string().optional().describe("'safari' or 'chrome' (defaults to Safari)"),
  },
  async ({ label, option, browser }) => {
    try {
      const result = await selectOption(label, option, browser);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      return { isError: true, content: [{ type: "text", text: String(err) }] };
    }
  },
);

// ── Batch actions ───────────────────────────────────────────────

const batchActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("click"), x: z.number(), y: z.number() }),
  z.object({ action: z.literal("double_click"), x: z.number(), y: z.number() }),
  z.object({ action: z.literal("click_element"), app: z.string(), name: z.string() }),
  z.object({ action: z.literal("type"), text: z.string() }),
  z.object({ action: z.literal("key"), key: z.string(), modifiers: z.array(z.string()).optional() }),
  z.object({ action: z.literal("scroll"), direction: z.enum(["up", "down", "left", "right"]), amount: z.number().optional() }),
  z.object({ action: z.literal("launch_app"), name: z.string() }),
  z.object({ action: z.literal("open_url"), url: z.string(), browser: z.string().optional() }),
  z.object({ action: z.literal("set_clipboard"), text: z.string() }),
  z.object({ action: z.literal("execute_javascript"), code: z.string(), browser: z.string().optional() }),
  z.object({ action: z.literal("click_text"), text: z.string(), element_type: z.string().optional(), index: z.number().optional(), browser: z.string().optional() }),
  z.object({ action: z.literal("fill_label"), label: z.string(), value: z.string(), browser: z.string().optional() }),
  z.object({ action: z.literal("select_option"), label: z.string(), option: z.string(), browser: z.string().optional() }),
]);

server.tool(
  "batch_actions",
  `PREFERRED: Always use this tool instead of calling individual action tools (click_at, type_text, press_key, launch_app, etc.) one at a time. Combine multiple steps into a single batch call — this is dramatically faster. Only use individual tools when you need to read the result of one action before deciding the next. Returns a single screenshot at the end. Stops on first error. Max 20 actions per call.

Example — open Notes and write text (1 call instead of 6):
  [{ "action": "launch_app", "name": "Notes" }, { "action": "key", "key": "n", "modifiers": ["command"] }, { "action": "set_clipboard", "text": "Hello\\nWorld" }, { "action": "key", "key": "v", "modifiers": ["command"] }]`,
  {
    actions: z.array(batchActionSchema).min(1).max(20).describe("Array of actions to execute sequentially"),
    delay_between_ms: z.number().optional().describe("Delay between actions in ms (default 100)"),
  },
  async ({ actions, delay_between_ms }) => {
    try {
      const { result, screenshot } = await batchActions(actions, delay_between_ms);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
          { type: "image", data: screenshot.base64, mimeType: screenshot.mimeType },
        ],
      };
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
  // Pre-warm Python helper in background so first OCR/click doesn't pay startup cost
  warmupPythonHelper();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
