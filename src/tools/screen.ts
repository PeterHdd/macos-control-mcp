import { captureScreenshot } from "../utils/screenshot.js";

export async function getScreenState(
  app?: string,
): Promise<{ base64: string; mimeType: string }> {
  return captureScreenshot(app);
}
