/**
 * Tabs that came back from disk at startup. Only these may auto-run
 * `claude --resume`, and only once: a tab that learned its session id while
 * running in this session must never re-resume itself.
 */
const restored = new Set<string>();

export function markRestored(ids: string[]): void {
  ids.forEach((id) => restored.add(id));
}

/** True the first time it is asked about a restored tab, false after. */
export function takeRestored(id: string): boolean {
  return restored.delete(id);
}
