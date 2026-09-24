import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { TabState } from "./types";
import { reportError } from "./errors";

/** Label of the floating window that lists every live tab. */
export const MINI_LABEL = "mini";

/** Events between the main window and the mini panel. */
export const MINI_READY = "mini-ready";
export const MINI_STATE = "mini-state";
export const MINI_ACTIVATE = "mini-activate";
export const MINI_CLOSED = "mini-closed";
export const MINI_BOUNDS = "mini-bounds";

export interface MiniBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MiniRow {
  id: string;
  title: string;
  state: TabState;
  color: string;
  group: string;
  agents: number;
}

/** Opens the mini panel where it last was, always above other windows. */
export function openMiniWindow(bounds: MiniBounds | null): void {
  const win = new WebviewWindow(MINI_LABEL, {
    url: "index.html",
    title: "Shellhive",
    width: bounds?.width ?? 260,
    height: bounds?.height ?? 320,
    minWidth: 200,
    minHeight: 120,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    alwaysOnTop: true,
    skipTaskbar: true,
    dragDropEnabled: false,
  });
  win.once("tauri://error", (e) => reportError("window", `mini panel failed: ${JSON.stringify(e.payload)}`));
}

export function closeMiniWindow(): void {
  void WebviewWindow.getByLabel(MINI_LABEL).then((w) => w?.close());
}
