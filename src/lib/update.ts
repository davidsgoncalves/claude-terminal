import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";

export const RELEASES_URL = "https://github.com/davidsgoncalves/claude-terminal/releases";
const MANIFEST = `${RELEASES_URL}/latest/download/latest.json`;

/** How this build was installed, which decides how it can update itself. */
export async function installKind(): Promise<string> {
  return invoke<string>("install_kind").catch(() => "native");
}

export type Found =
  | { kind: "native"; version: string; update: Update }
  | { kind: "package"; version: string; url: string };

/** Compares dotted versions without treating them as numbers end to end. */
export function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/**
 * Looks for a newer release. A package install cannot use the Tauri updater,
 * so its path reads the manifest directly and returns the download instead.
 */
export async function findUpdate(): Promise<Found | null> {
  if ((await installKind()) === "package") {
    const manifest = await fetch(MANIFEST, { cache: "no-store" }).then((r) => r.json());
    const url = manifest?.platforms?.["linux-x86_64-deb"]?.url;
    const current = await getVersion();
    if (!url || !isNewer(manifest.version, current)) return null;
    return { kind: "package", version: manifest.version, url };
  }
  const update = await check();
  return update ? { kind: "native", version: update.version, update } : null;
}
