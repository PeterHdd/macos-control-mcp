import { runAppleScript, escapeForAppleScript } from "../utils/applescript.js";
import { focusApp } from "./apps.js";

const KEY_CODES: Record<string, number> = {
  return: 36,
  enter: 36,
  tab: 48,
  space: 49,
  delete: 51,
  backspace: 51,
  escape: 53,
  esc: 53,

  // Arrow keys
  left: 123,
  right: 124,
  down: 125,
  up: 126,

  // Function keys
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,

  // Other common keys
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
  forwarddelete: 117,

  // Letters (for use with modifiers via key code)
  a: 0, b: 11, c: 8, d: 2, e: 14, f: 3, g: 5, h: 4, i: 34,
  j: 38, k: 40, l: 37, m: 46, n: 45, o: 31, p: 35, q: 12,
  r: 15, s: 1, t: 17, u: 32, v: 9, w: 13, x: 7, y: 16, z: 6,

  // Numbers
  "0": 29, "1": 18, "2": 19, "3": 20, "4": 21,
  "5": 23, "6": 22, "7": 26, "8": 28, "9": 25,
};

const MODIFIER_MAP: Record<string, string> = {
  command: "command down",
  cmd: "command down",
  shift: "shift down",
  option: "option down",
  alt: "option down",
  control: "control down",
  ctrl: "control down",
};

export async function typeText(text: string, app?: string): Promise<string> {
  if (app) await focusApp(app);

  // Build a single AppleScript that types all lines with Return between them.
  const lines = text.split("\n");
  const commands: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 0) {
      const safe = escapeForAppleScript(lines[i]);
      commands.push(`keystroke "${safe}"`);
    }
    if (i < lines.length - 1) {
      commands.push(`key code 36`);
    }
  }

  if (commands.length > 0) {
    await runAppleScript(
      `tell application "System Events"\n${commands.join("\n")}\nend tell`,
    );
  }

  return `Typed "${text}".`;
}

export async function pressKey(
  key: string,
  modifiers?: string[],
  app?: string,
): Promise<string> {
  if (app) await focusApp(app);

  const keyLower = key.toLowerCase();
  const keyCode = KEY_CODES[keyLower];

  if (keyCode === undefined) {
    throw new Error(
      `Unknown key "${key}". Supported keys: ${Object.keys(KEY_CODES).join(", ")}`,
    );
  }

  let script: string;

  if (modifiers && modifiers.length > 0) {
    const modList = modifiers.map((m) => {
      const mapped = MODIFIER_MAP[m.toLowerCase()];
      if (!mapped) {
        throw new Error(
          `Unknown modifier "${m}". Supported: ${Object.keys(MODIFIER_MAP).join(", ")}`,
        );
      }
      return mapped;
    });
    const modString = modList.length === 1 ? modList[0] : `{${modList.join(", ")}}`;
    script = `tell application "System Events" to key code ${keyCode} using ${modString}`;
  } else {
    script = `tell application "System Events" to key code ${keyCode}`;
  }

  await runAppleScript(script);

  const modDesc = modifiers?.length ? ` with ${modifiers.join("+")}` : "";
  return `Pressed ${key}${modDesc}.`;
}
