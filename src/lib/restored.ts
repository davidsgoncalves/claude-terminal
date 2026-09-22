/**
 * Tabs whose next shell should run `claude --resume`.
 *
 * A tab is added when it is restored from disk at startup, when it is opened
 * from the session list, and when a closed tab is reopened. It is never added
 * because a running session reported its id, which would make a live session
 * try to resume itself.
 */
const pending = new Set<string>();

export function markPendingResume(ids: string[]): void {
  ids.forEach((id) => pending.add(id));
}

/** True the first time it is asked about a marked tab, false after. */
export function takePendingResume(id: string): boolean {
  return pending.delete(id);
}
