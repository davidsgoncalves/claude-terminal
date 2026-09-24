import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { reportError } from "./errors";

/** Events between the main window and the windows holding a single terminal. */
export const DETACH_READY = "detach-ready";
export const DETACH_SNAPSHOT = "detach-snapshot";
export const DETACH_RESIZE = "detach-resize";
export const DETACH_CLOSED = "detach-closed";
export const DETACH_TITLE = "detach-title";

export const MAIN_LABEL = "main";
const PREFIX = "term-";

export interface DetachSnapshot {
  id: string;
  data: string;
  cols: number;
  rows: number;
  /** Tab folder, for resolving relative paths in links. */
  cwd: string | null;
}

export function detachedLabel(tabId: string): string {
  return `${PREFIX}${tabId}`;
}

/** Tab id held by a detached window, or null for the main window. */
export function tabIdOfLabel(label: string): string | null {
  return label.startsWith(PREFIX) ? label.slice(PREFIX.length) : null;
}

/** Opens a window holding only this tab's terminal, at a screen point when given. */
export function openDetachedWindow(tabId: string, title: string, at?: { x: number; y: number }): void {
  const win = new WebviewWindow(detachedLabel(tabId), {
    url: "index.html",
    title,
    width: 900,
    height: 600,
    ...(at ? { x: Math.max(0, at.x - 60), y: Math.max(0, at.y - 20) } : {}),
    dragDropEnabled: false,
  });
  win.once("tauri://error", (e) => reportError("window", `detached window failed: ${JSON.stringify(e.payload)}`));
}

export function focusDetachedWindow(tabId: string): void {
  void WebviewWindow.getByLabel(detachedLabel(tabId)).then((w) => w?.setFocus());
}

export function closeDetachedWindow(tabId: string): void {
  void WebviewWindow.getByLabel(detachedLabel(tabId)).then((w) => w?.close());
}

export function setDetachedTitle(tabId: string, title: string): void {
  void WebviewWindow.getByLabel(detachedLabel(tabId)).then((w) => w?.setTitle(title));
  void emitTo(detachedLabel(tabId), DETACH_TITLE, title);
}

/** True when a drag ended with the cursor outside this window. */
export function droppedOutside(e: { screenX: number; screenY: number }): boolean {
  const { screenX: x, screenY: y } = e;
  return (
    x < window.screenX ||
    y < window.screenY ||
    x > window.screenX + window.outerWidth ||
    y > window.screenY + window.outerHeight
  );
}

/** True when a screen point, in CSS pixels, falls inside the main window. */
export async function overMainWindow(x: number, y: number): Promise<boolean> {
  const main = await WebviewWindow.getByLabel(MAIN_LABEL);
  if (!main) return false;
  const [pos, size, scale] = await Promise.all([main.outerPosition(), main.outerSize(), main.scaleFactor()]);
  const left = pos.x / scale;
  const top = pos.y / scale;
  return x >= left && y >= top && x <= left + size.width / scale && y <= top + size.height / scale;
}
