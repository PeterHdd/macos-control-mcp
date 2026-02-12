import { runAppleScript, escapeForAppleScript } from "../utils/applescript.js";

type Browser = "Safari" | "Google Chrome";

function detectBrowser(browser?: string): Browser {
  if (browser?.toLowerCase().includes("chrome")) return "Google Chrome";
  return "Safari";
}

export async function getBrowserUrl(browser?: string): Promise<string> {
  const b = detectBrowser(browser);

  if (b === "Google Chrome") {
    return runAppleScript(
      `tell application "Google Chrome" to get URL of active tab of front window`,
    );
  }
  return runAppleScript(
    `tell application "Safari" to get URL of front document`,
  );
}

interface BrowserTab {
  title: string;
  url: string;
}

export async function getBrowserTabs(browser?: string): Promise<string> {
  const b = detectBrowser(browser);

  let script: string;
  if (b === "Google Chrome") {
    script = `
tell application "Google Chrome"
  set output to ""
  repeat with w in windows
    repeat with t in tabs of w
      set output to output & (title of t) & "|||" & (URL of t) & "\\n"
    end repeat
  end repeat
  return output
end tell`;
  } else {
    script = `
tell application "Safari"
  set output to ""
  repeat with w in windows
    repeat with t in tabs of w
      set output to output & (name of t) & "|||" & (URL of t) & "\\n"
    end repeat
  end repeat
  return output
end tell`;
  }

  const raw = await runAppleScript(script);
  const tabs: BrowserTab[] = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [title, url] = line.split("|||");
      return { title: title || "", url: url || "" };
    });

  return JSON.stringify({ browser: b, tabCount: tabs.length, tabs }, null, 2);
}

export async function openUrl(
  url: string,
  browser?: string,
): Promise<string> {
  // Only allow http/https schemes
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Only http:// and https:// URLs are allowed.");
  }

  const b = detectBrowser(browser);
  const safeUrl = escapeForAppleScript(url);

  if (b === "Google Chrome") {
    await runAppleScript(`
tell application "Google Chrome"
  activate
  open location "${safeUrl}"
end tell`);
  } else {
    await runAppleScript(`
tell application "Safari"
  activate
  open location "${safeUrl}"
end tell`);
  }

  return `Opened ${url} in ${b}.`;
}
