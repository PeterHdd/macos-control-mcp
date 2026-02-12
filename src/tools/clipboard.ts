import { runAppleScript, escapeForAppleScript } from "../utils/applescript.js";

export async function getClipboard(): Promise<string> {
  const content = await runAppleScript("the clipboard as text");
  return content;
}

export async function setClipboard(text: string): Promise<string> {
  const safe = escapeForAppleScript(text);
  await runAppleScript(`set the clipboard to "${safe}"`);
  return `Clipboard set to: "${text}"`;
}
