import { invoke } from "@tauri-apps/api/core";
import { useStore } from "./store";
import type { SessionTitles, Tab } from "./types";

/**
 * Pulls the session title out of the transcript and applies it to the tab.
 *
 * A `/rename` inside Claude Code always wins, even over a name typed in the
 * sidebar, because it is the more recent explicit choice. Claude's generated
 * title only fills in a tab the user never named.
 */
export async function syncTabTitle(tabId: string): Promise<void> {
  const tab = useStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab?.transcriptPath) return;

  const titles = await invoke<SessionTitles>("session_titles", { path: tab.transcriptPath }).catch(
    () => null,
  );
  if (!titles) return;

  const patch = titlePatch(tab, titles);
  if (patch) useStore.getState().patchTab(tabId, patch);
}

export function titlePatch(tab: Tab, titles: SessionTitles): Partial<Tab> | null {
  if (titles.custom && titles.custom !== tab.claudeTitle) {
    return { title: titles.custom, claudeTitle: titles.custom, customTitle: true };
  }
  if (!tab.customTitle && titles.ai && titles.ai !== tab.title) {
    return { title: titles.ai };
  }
  return null;
}

/** Best label for a stored session: explicit rename, then Claude's title. */
export function sessionLabel(s: {
  titles: SessionTitles;
  first_prompt: string | null;
  id: string;
}): string {
  return s.titles.custom || s.titles.ai || s.first_prompt || `sessão ${s.id.slice(0, 8)}`;
}
