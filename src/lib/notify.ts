import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

let granted: boolean | null = null;

async function ensurePermission(): Promise<boolean> {
  if (granted !== null) return granted;
  granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  return granted;
}

/** Fires a macOS notification, skipped while the window has focus. */
export async function notify(title: string, body: string, force = false): Promise<void> {
  if (!force && document.hasFocus()) return;
  try {
    if (await ensurePermission()) sendNotification({ title, body });
  } catch (err) {
    console.error("notification failed", err);
  }
}
