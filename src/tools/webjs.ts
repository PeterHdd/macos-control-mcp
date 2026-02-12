import { runAppleScript, escapeForAppleScript } from "../utils/applescript.js";

type Browser = "Safari" | "Google Chrome";

function detectBrowser(browser?: string): Browser {
  if (browser?.toLowerCase().includes("chrome")) return "Google Chrome";
  return "Safari";
}

function buildJsScript(browser: Browser, code: string): string {
  const safeCode = escapeForAppleScript(code);
  if (browser === "Google Chrome") {
    return `tell application "Google Chrome" to execute active tab of front window javascript "${safeCode}"`;
  }
  return `tell application "Safari" to do JavaScript "${safeCode}" in front document`;
}

export async function executeJavaScript(
  code: string,
  browser?: string,
): Promise<string> {
  const b = detectBrowser(browser);
  const result = await runAppleScript(buildJsScript(b, code));
  return result || "(no return value)";
}

export async function getPageText(browser?: string): Promise<string> {
  const b = detectBrowser(browser);
  const code = "document.body.innerText";
  const result = await runAppleScript(buildJsScript(b, code));
  // Truncate to avoid blowing up context
  if (result.length > 50_000) {
    return result.substring(0, 50_000) + "\n\n[Truncated — showing first 50KB]";
  }
  return result;
}

export async function clickWebElement(
  selector: string,
  browser?: string,
): Promise<string> {
  const b = detectBrowser(browser);
  const code = `(function() {
    var el = document.querySelector('${selector.replace(/'/g, "\\'")}');
    if (!el) return 'Element not found: ${selector.replace(/'/g, "\\'")}';
    el.click();
    return 'Clicked: ' + (el.tagName || '') + ' ' + (el.textContent || '').substring(0, 50).trim();
  })()`;
  return runAppleScript(buildJsScript(b, code));
}

export async function fillFormField(
  selector: string,
  value: string,
  browser?: string,
): Promise<string> {
  const b = detectBrowser(browser);
  const safeValue = value.replace(/'/g, "\\'").replace(/\n/g, "\\n");
  const safeSelector = selector.replace(/'/g, "\\'");
  const code = `(function() {
    var el = document.querySelector('${safeSelector}');
    if (!el) return 'Element not found: ${safeSelector}';
    el.focus();
    el.value = '${safeValue}';
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
    return 'Filled: ' + (el.tagName || '') + ' with ' + '${safeValue}'.substring(0, 50);
  })()`;
  return runAppleScript(buildJsScript(b, code));
}
