import { captureScreenshot } from "../utils/screenshot.js";
import { runPython } from "../utils/python.js";

// Overloads: without skipScreenshot, screenshot is always present
export async function clickAt(
  x: number,
  y: number,
): Promise<{ text: string; screenshot: { base64: string; mimeType: string } }>;
export async function clickAt(
  x: number,
  y: number,
  options: { skipScreenshot: true },
): Promise<{ text: string }>;
export async function clickAt(
  x: number,
  y: number,
  options?: { skipScreenshot?: boolean },
): Promise<{ text: string; screenshot?: { base64: string; mimeType: string } }> {
  await runPython(`
import Quartz
point = Quartz.CGPointMake(${x}, ${y})
event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, point, Quartz.kCGMouseButtonLeft)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, point, Quartz.kCGMouseButtonLeft)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
`);

  const text = `Clicked at (${x}, ${y}).`;

  if (options?.skipScreenshot) {
    return { text };
  }

  await new Promise((r) => setTimeout(r, 300));
  const screenshot = await captureScreenshot();
  return { text, screenshot };
}

// Overloads: without skipScreenshot, screenshot is always present
export async function doubleClickAt(
  x: number,
  y: number,
): Promise<{ text: string; screenshot: { base64: string; mimeType: string } }>;
export async function doubleClickAt(
  x: number,
  y: number,
  options: { skipScreenshot: true },
): Promise<{ text: string }>;
export async function doubleClickAt(
  x: number,
  y: number,
  options?: { skipScreenshot?: boolean },
): Promise<{ text: string; screenshot?: { base64: string; mimeType: string } }> {
  await runPython(`
import Quartz
point = Quartz.CGPointMake(${x}, ${y})
event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, point, Quartz.kCGMouseButtonLeft)
Quartz.CGEventSetIntegerValueField(event, Quartz.kCGMouseEventClickState, 1)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, point, Quartz.kCGMouseButtonLeft)
Quartz.CGEventSetIntegerValueField(event, Quartz.kCGMouseEventClickState, 1)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, point, Quartz.kCGMouseButtonLeft)
Quartz.CGEventSetIntegerValueField(event, Quartz.kCGMouseEventClickState, 2)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, point, Quartz.kCGMouseButtonLeft)
Quartz.CGEventSetIntegerValueField(event, Quartz.kCGMouseEventClickState, 2)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
`);

  const text = `Double-clicked at (${x}, ${y}).`;

  if (options?.skipScreenshot) {
    return { text };
  }

  await new Promise((r) => setTimeout(r, 300));
  const screenshot = await captureScreenshot();
  return { text, screenshot };
}

export async function scroll(
  direction: "up" | "down" | "left" | "right",
  amount: number,
): Promise<string> {
  let dx = 0;
  let dy = 0;
  switch (direction) {
    case "up":
      dy = amount;
      break;
    case "down":
      dy = -amount;
      break;
    case "left":
      dx = amount;
      break;
    case "right":
      dx = -amount;
      break;
  }

  await runPython(`
import Quartz
event = Quartz.CGEventCreateScrollWheelEvent(None, Quartz.kCGScrollEventUnitLine, 2, ${dy}, ${dx})
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
`);

  return `Scrolled ${direction} by ${amount}.`;
}
