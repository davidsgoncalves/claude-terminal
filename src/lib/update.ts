import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";

export const RELEASES_URL = "https://github.com/davidsgoncalves/claude-terminal/releases";

/** How this build was installed, which decides how it can update itself. */
export async function installKind(): Promise<string> {
  return invoke<string>("install_kind").catch(() => "native");
}

export type Found =
  | { kind: "native"; version: string; update: Update }
  | { kind: "package"; version: string };

/**
 * Looks for a newer release. A package install cannot be replaced by the Tauri
 * updater, so the backend looks up the .deb entry and installs it later.
 */
export async function findUpdate(): Promise<Found | null> {
  if ((await installKind()) === "package") {
    const version = await invoke<string | null>("package_update_check");
    return version ? { kind: "package", version } : null;
  }
  const update = await check();
  return update ? { kind: "native", version: update.version, update } : null;
}
