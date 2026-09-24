import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { findUpdate } from "./update";

export type Phase = "idle" | "found" | "working" | "ready" | "handed-off" | "restart-failed" | "error";

interface PackageUpdate {
  version: string;
}

interface Updater {
  update: Update | null;
  pkg: PackageUpdate | null;
  phase: Phase;
  progress: number;
  message: string | null;
  /** The top banner was closed; Sobre still offers the update. */
  dismissed: boolean;
  /** Looks for a newer release; resolves to its version, or null when current. */
  look: () => Promise<string | null>;
  install: () => Promise<void>;
  restart: () => Promise<void>;
  dismiss: () => void;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * One update state for the banner and the Sobre tab, so a check made from
 * either one shows up in both. A macOS build and a Linux AppImage install
 * themselves through the updater; a Linux package install cannot, so the new
 * .deb is downloaded and handed to the system installer instead.
 */
export const useUpdater = create<Updater>()((set, get) => ({
  update: null,
  pkg: null,
  phase: "idle",
  progress: 0,
  message: null,
  dismissed: false,

  look: async () => {
    // A download in progress or a pending restart must not be reset.
    if (get().phase !== "idle" && get().phase !== "found") {
      return get().update?.version ?? get().pkg?.version ?? null;
    }
    const found = await findUpdate();
    if (!found) return null;
    if (found.kind === "native") set({ update: found.update, pkg: null, phase: "found", dismissed: false });
    else set({ pkg: { version: found.version }, update: null, phase: "found", dismissed: false });
    return found.version;
  },

  install: async () => {
    const { update, pkg } = get();
    set({ phase: "working", progress: 0, dismissed: false });
    try {
      if (update) {
        let total = 0;
        let got = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === "Started") total = event.data.contentLength ?? 0;
          if (event.event === "Progress") {
            got += event.data.chunkLength;
            if (total > 0) set({ progress: Math.round((got / total) * 100) });
          }
        });
        set({ phase: "ready" });
        return;
      }
      if (!pkg) return;
      // Downloaded and verified by the backend; the webview cannot fetch it.
      const unlisten = await listen<number>("package-update-progress", (ev) => set({ progress: ev.payload }));
      try {
        const result = await invoke<string>("package_update_install");
        set({ phase: result === "installed" ? "ready" : "handed-off" });
      } finally {
        unlisten();
      }
    } catch (err) {
      set({ phase: "error", message: errorText(err) });
    }
  },

  // Replacing the bundle can leave the old executable path unusable, so a
  // failed restart says so instead of looking like a dead button.
  restart: async () => {
    try {
      // Reopens the bundle on macOS; falls back to the plugin elsewhere.
      await invoke("restart_app");
    } catch (first) {
      try {
        await relaunch();
      } catch (err) {
        set({ phase: "restart-failed", message: [first, err].map(errorText).join(" · ") });
      }
    }
  },

  dismiss: () => {
    const { phase } = get();
    // Closing an error or a handed-off notice ends it; closing an offer only
    // hides the banner, and Sobre keeps it.
    if (phase === "found" || phase === "ready") set({ dismissed: true });
    else set({ update: null, pkg: null, phase: "idle", message: null, dismissed: false });
  },
}));
