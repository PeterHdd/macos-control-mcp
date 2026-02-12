# macos-control-mcp

Give AI agents **eyes and hands** on macOS.

[![npm](https://img.shields.io/npm/v/macos-control-mcp)](https://www.npmjs.com/package/macos-control-mcp)
[![license](https://img.shields.io/npm/l/macos-control-mcp)](./LICENSE)
![macOS](https://img.shields.io/badge/macOS-13%2B-blue)

## What is this?

An [MCP server](https://modelcontextprotocol.io) that lets AI agents **see your screen, read text on it, and interact** — click, type, scroll — just like a human sitting at the keyboard. Unlike blind script runners, this MCP gives agents _state awareness_: they screenshot the screen, OCR it to get text with pixel coordinates, then click exactly where they need to.

## The See-Think-Act Loop

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   1. SEE        screenshot / screen_ocr         │
│      ↓          "What's on the screen?"         │
│                                                 │
│   2. THINK      AI reasons about the content    │
│      ↓          "I need to click the Save btn"  │
│                                                 │
│   3. ACT        click_at / type_text / press_key│
│                 "Click at (425, 300)"           │
│                                                 │
│      ↻ repeat                                   │
└─────────────────────────────────────────────────┘
```

This is what makes it powerful: the agent _sees_ the result of every action and can course-correct, retry, or move on — just like you would.

## Quick Start

No install needed — run directly with npx:

```bash
npx -y macos-control-mcp
```

On first run, a Python virtual environment is automatically created at `~/.macos-control-mcp/.venv` with the required Apple Vision and Quartz frameworks. This takes ~60 seconds once and persists across updates.

## Configure Your AI Client

All clients use the same command: `npx -y macos-control-mcp`

<details>
<summary><strong>Claude Desktop</strong></summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "macos-control": {
      "command": "npx",
      "args": ["-y", "macos-control-mcp"]
    }
  }
}
```

Restart Claude Desktop after saving.
</details>

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add macos-control -- npx -y macos-control-mcp
```
</details>

<details>
<summary><strong>VS Code / GitHub Copilot</strong></summary>

Add to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "macos-control": {
      "command": "npx",
      "args": ["-y", "macos-control-mcp"]
    }
  }
}
```
</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "macos-control": {
      "command": "npx",
      "args": ["-y", "macos-control-mcp"]
    }
  }
}
```
</details>

<details>
<summary><strong>Cline</strong></summary>

Open Cline extension settings → MCP Servers → Add:

```json
{
  "macos-control": {
    "command": "npx",
    "args": ["-y", "macos-control-mcp"]
  }
}
```
</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "macos-control": {
      "command": "npx",
      "args": ["-y", "macos-control-mcp"]
    }
  }
}
```
</details>

## Permissions

macOS requires two permissions for full functionality:

1. **Screen Recording** — for screenshots and OCR
2. **Accessibility** — for clicking, typing, and reading UI elements

Go to **System Settings → Privacy & Security** and add your terminal app (Terminal, iTerm2, VS Code, etc.) to both lists. You'll be prompted on first use.

## Tools (15)

### See the screen

| Tool | Description |
|---|---|
| `screenshot` | Capture full screen or app window as PNG |
| `screen_ocr` | OCR the screen — returns text elements with pixel coordinates |
| `find_text_on_screen` | Find specific text and get clickable x,y coordinates |

### Interact with the screen

| Tool | Description |
|---|---|
| `click_at` | Click at x,y coordinates (returns screenshot) |
| `double_click_at` | Double-click at x,y (returns screenshot) |
| `type_text` | Type text into the frontmost app |
| `press_key` | Press key combos (Cmd+S, Ctrl+C, etc.) |
| `scroll` | Scroll up/down/left/right |

### App management

| Tool | Description |
|---|---|
| `launch_app` | Open or focus an application |
| `list_running_apps` | List visible running apps |

### Accessibility tree

| Tool | Description |
|---|---|
| `get_ui_elements` | Get accessibility tree of an app window |
| `click_element` | Click a named UI element (returns screenshot) |

### Utilities

| Tool | Description |
|---|---|
| `open_url` | Open URL in Safari or Chrome |
| `get_clipboard` | Read clipboard contents |
| `set_clipboard` | Write to clipboard |

## Example Workflows

### Fill out a web form

```
You: "Go to example.com/signup and fill in my details"

Agent:
1. open_url("https://example.com/signup")
2. screenshot() → sees the form
3. screen_ocr() → finds "Email" field at (300, 250)
4. click_at(300, 250) → clicks the email field
5. type_text("user@example.com")
6. find_text_on_screen("Submit") → gets button coordinates
7. click_at(350, 500) → submits the form
8. screenshot() → confirms success
```

### Navigate an unfamiliar app

```
You: "Change the font size to 16 in TextEdit"

Agent:
1. launch_app("TextEdit")
2. screenshot() → sees the app
3. get_ui_elements("TextEdit") → finds menu items
4. press_key("t", ["command"]) → opens Fonts panel
5. screenshot() → sees the font panel
6. find_text_on_screen("Size") → locates the size field
7. click_at(x, y) → clicks size field
8. type_text("16")
9. press_key("return")
```

### Extract info from an email

```
You: "Copy the tracking number from the shipping email in Mail"

Agent:
1. launch_app("Mail")
2. screenshot() → sees the inbox
3. find_text_on_screen("Your order has shipped") → locates the email
4. click_at(x, y) → opens the email
5. screenshot() → sees the email content
6. screen_ocr() → extracts all text including tracking number
7. set_clipboard("1Z999AA10123456784") → copies to clipboard
```

### Take a screenshot and describe what's on screen

```
You: "What do I have open right now?"

Agent:
1. screenshot() → captures the full screen
2. Describes what it sees: apps, windows, content
3. list_running_apps() → ["Safari", "Slack", "VS Code", "Spotify"]
4. "You have Safari open on Twitter, Slack with 3 unread messages, and VS Code editing index.ts"
```

### Debug a UI issue

```
You: "The submit button on this page isn't working, can you check what's happening?"

Agent:
1. screenshot() → sees the page
2. find_text_on_screen("Submit") → locates button at (500, 600)
3. get_ui_elements("Safari") → inspects accessibility tree
4. "The button has aria-disabled=true. There's a required field 'Phone' that's empty."
5. find_text_on_screen("Phone") → locates the field
6. click_at(x, y) → clicks the field
7. type_text("+1 555-0123")
8. click_at(500, 600) → clicks Submit again
9. screenshot() → confirms it worked
```

### Control Spotify

```
You: "Pause the music and turn the volume down"

Agent:
1. launch_app("Spotify")
2. screenshot() → sees Spotify is playing
3. find_text_on_screen("Pause") → locates pause button
4. click_at(x, y) → pauses playback
5. find_text_on_screen("Volume") → locates volume slider area
6. click_at(x, y) → adjusts volume
7. screenshot() → confirms paused and volume lowered
```

### Work with Finder

```
You: "Create a new folder on my Desktop called 'Project Assets' and move it to Documents"

Agent:
1. launch_app("Finder")
2. press_key("d", ["command", "shift"]) → opens Desktop
3. screenshot() → sees Desktop in Finder
4. press_key("n", ["command", "shift"]) → creates new folder
5. type_text("Project Assets")
6. press_key("return")
7. screenshot() → confirms folder created
```

### Send a message in Slack

```
You: "Send 'build is green, ready to deploy' in the #engineering channel on Slack"

Agent:
1. launch_app("Slack")
2. screenshot() → sees Slack
3. press_key("k", ["command"]) → opens Quick Switcher
4. type_text("engineering")
5. press_key("return") → opens #engineering
6. screenshot() → confirms channel is open
7. click_at(x, y) → clicks message input
8. type_text("build is green, ready to deploy")
9. press_key("return") → sends message
10. screenshot() → confirms sent
```

### Research and copy data from a website

```
You: "Look up the current price of AAPL on Google Finance and copy it"

Agent:
1. open_url("https://google.com/finance/quote/AAPL:NASDAQ")
2. screenshot() → sees the page loading
3. screen_ocr() → reads all text on the page
4. Finds the price: "$187.42"
5. set_clipboard("$187.42")
6. "Copied AAPL price $187.42 to your clipboard"
```

### Multi-app workflow

```
You: "Take what's in my clipboard, search for it in Safari, and screenshot the results"

Agent:
1. get_clipboard() → "best mechanical keyboards 2025"
2. launch_app("Safari")
3. press_key("l", ["command"]) → focuses address bar
4. type_text("best mechanical keyboards 2025")
5. press_key("return") → searches
6. screenshot() → captures the search results
7. "Here are the search results for 'best mechanical keyboards 2025'"
```

### Navigate System Settings

```
You: "Turn on Dark Mode"

Agent:
1. launch_app("System Settings")
2. screenshot() → sees System Settings
3. find_text_on_screen("Appearance") → locates the option
4. click_at(x, y) → opens Appearance settings
5. screenshot() → sees Light/Dark/Auto options
6. find_text_on_screen("Dark") → locates Dark mode option
7. click_at(x, y) → enables Dark Mode
8. screenshot() → confirms Dark Mode is on
```

## Requirements

- **macOS 13+** (Ventura or later)
- **Node.js 18+**
- **Python 3.9+** (pre-installed on macOS — needed for OCR and mouse control)

## How It Works

- **Screenshots** — native `screencapture` CLI
- **OCR** — Apple Vision framework (VNRecognizeTextRequest) via Python bridge, returns text with bounding box coordinates
- **Mouse** — Quartz Core Graphics events via Python bridge for precise pixel-level control
- **Keyboard & Apps** — AppleScript via `osascript` for key presses, app launching, and UI element interaction
- **Python env** — auto-managed venv at `~/.macos-control-mcp/.venv/` with only two packages (`pyobjc-framework-Vision`, `pyobjc-framework-Quartz`)

## Troubleshooting

**"Permission denied" or blank screenshots**
→ Add your terminal to System Settings → Privacy & Security → Screen Recording

**Clicks don't work**
→ Add your terminal to System Settings → Privacy & Security → Accessibility

**Python setup fails**
→ Ensure `python3` is in your PATH. Run `python3 --version` to check. Non-Python tools (keyboard, apps, clipboard) still work without it.

**OCR returns empty results**
→ Make sure Screen Recording permission is granted. Try a full-screen OCR first (without the `app` parameter).

**"App not found" errors**
→ Use the exact app name as shown in Activity Monitor (e.g., "Google Chrome" not "Chrome").

## License

[MIT](./LICENSE)
