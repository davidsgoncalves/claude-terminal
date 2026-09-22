import { invoke } from "@tauri-apps/api/core";
import type { StateStorage } from "zustand/middleware";

const LEGACY_KEY = "claude-terminal-layout";
const WRITE_DELAY_MS = 400;

let pendingValue: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastWritten: string | null = null;

function flush(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pendingValue === null || pendingValue === lastWritten) return;
  const value = pendingValue;
  pendingValue = null;
  lastWritten = value;
  void invoke("state_save", { contents: value }).catch((err) => console.error("state_save failed", err));
}

// The webview can go away without warning; make sure the last change lands.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
}

/**
 * Persists UI state to a file in the app config dir rather than localStorage,
 * so it survives app restarts and the dev/production origin change.
 * Writes are debounced because the store changes on every hook event.
 */
export const fileStorage: StateStorage = {
  getItem: async (): Promise<string | null> => {
    const stored = await invoke<string | null>("state_load").catch(() => null);
    if (stored) {
      lastWritten = stored;
      return stored;
    }
    // One-time pickup of layouts saved before persistence moved to disk.
    try {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        localStorage.removeItem(LEGACY_KEY);
        lastWritten = legacy;
        void invoke("state_save", { contents: legacy });
        return legacy;
      }
    } catch {
      // Private mode or blocked storage: nothing to migrate.
    }
    return null;
  },

  setItem: async (_name: string, value: string): Promise<void> => {
    pendingValue = value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, WRITE_DELAY_MS);
  },

  removeItem: async (): Promise<void> => {
    pendingValue = "";
    flush();
  },
};
