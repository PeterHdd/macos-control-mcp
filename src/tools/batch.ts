import { captureScreenshot } from "../utils/screenshot.js";
import { clickAt, doubleClickAt, scroll } from "./mouse.js";
import { typeText, pressKey } from "./input.js";
import { launchApp } from "./apps.js";
import { clickElement } from "./ui.js";
import { openUrl } from "./browser.js";
import { setClipboard } from "./clipboard.js";
import { executeJavaScript, clickWebElement, fillFormField } from "./webjs.js";

export type BatchAction =
  | { action: "click"; x: number; y: number }
  | { action: "double_click"; x: number; y: number }
  | { action: "click_element"; app: string; name: string }
  | { action: "type"; text: string }
  | { action: "key"; key: string; modifiers?: string[] }
  | { action: "scroll"; direction: "up" | "down" | "left" | "right"; amount?: number }
  | { action: "launch_app"; name: string }
  | { action: "open_url"; url: string; browser?: string }
  | { action: "set_clipboard"; text: string }
  | { action: "execute_javascript"; code: string; browser?: string }
  | { action: "click_web_element"; selector: string; browser?: string }
  | { action: "fill_form_field"; selector: string; value: string; browser?: string };

async function executeAction(action: BatchAction): Promise<string> {
  switch (action.action) {
    case "click": {
      const r = await clickAt(action.x, action.y, { skipScreenshot: true });
      return r.text;
    }
    case "double_click": {
      const r = await doubleClickAt(action.x, action.y, { skipScreenshot: true });
      return r.text;
    }
    case "click_element": {
      const r = await clickElement(action.app, action.name, { skipScreenshot: true });
      return r.text;
    }
    case "type":
      return typeText(action.text);
    case "key":
      return pressKey(action.key, action.modifiers);
    case "scroll":
      return scroll(action.direction, action.amount ?? 3);
    case "launch_app":
      return launchApp(action.name);
    case "open_url":
      return openUrl(action.url, action.browser);
    case "set_clipboard":
      return setClipboard(action.text);
    case "execute_javascript":
      return executeJavaScript(action.code, action.browser);
    case "click_web_element":
      return clickWebElement(action.selector, action.browser);
    case "fill_form_field":
      return fillFormField(action.selector, action.value, action.browser);
  }
}

export interface BatchResult {
  success: boolean;
  actionsCompleted: number;
  actionsTotal: number;
  results: string[];
  error?: string;
}

export async function batchActions(
  actions: BatchAction[],
  delayBetweenMs: number = 100,
): Promise<{ result: BatchResult; screenshot: { base64: string; mimeType: string } }> {
  const results: string[] = [];

  for (let i = 0; i < actions.length; i++) {
    try {
      const text = await executeAction(actions[i]);
      results.push(text);
    } catch (err: unknown) {
      // Stop on first error, capture screenshot of current state
      const screenshot = await captureScreenshot();
      return {
        result: {
          success: false,
          actionsCompleted: i,
          actionsTotal: actions.length,
          results,
          error: String(err),
        },
        screenshot,
      };
    }

    // Inter-action delay (skip after last action)
    if (i < actions.length - 1 && delayBetweenMs > 0) {
      await new Promise((r) => setTimeout(r, delayBetweenMs));
    }
  }

  // Wait for UI to settle, then capture final screenshot
  await new Promise((r) => setTimeout(r, 300));
  const screenshot = await captureScreenshot();

  return {
    result: {
      success: true,
      actionsCompleted: actions.length,
      actionsTotal: actions.length,
      results,
    },
    screenshot,
  };
}
