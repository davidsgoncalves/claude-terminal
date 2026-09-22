import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { fileStorage } from "./persist";
import {
  GROUP_COLORS,
  DEFAULT_TAB_TITLE,
  UNGROUPED_COLOR,
  UNGROUPED_ID,
  UNGROUPED_NAME,
  type Folder,
  type Group,
  type HookEvent,
  type HookSetup,
  type PermissionRequest,
  paneCount,
  type BarPosition,
  type Layout,
  type QuestionItem,
  type RateLimits,
  type SplitMode,
  type StatusEnvelope,
  type StatusPayload,
  type Tab,
  type TabState,
} from "./types";

const newId = () => crypto.randomUUID();

export type Modal =
  | null
  | { kind: "settings" }
  | { kind: "newGroup" }
  | { kind: "pickFolder"; groupId: string };

interface Store {
  groups: Group[];
  tabs: Tab[];
  activeTabId: string | null;
  sidebarOpen: boolean;
  eventsOpen: boolean;
  events: HookEvent[];
  setup: HookSetup | null;
  /** Latest statusline payload per tab: model, context, cost. */
  statusByTab: Record<string, StatusPayload>;
  /** Account-wide limits; whichever session reported last wins. */
  rateLimits: RateLimits | null;
  /** Permission requests waiting for a decision, oldest first. */
  permissions: PermissionRequest[];
  /** Tabs already announced by the watchdog, so it notifies once per episode. */
  alerted: string[];
  /** Claude session ids pinned to the top of the session list. */
  pinned: string[];
  /** Project folders offered when opening a session. */
  folders: Folder[];
  /** Folder id used when a session opens without an explicit choice. */
  defaultFolderId: string | null;
  /** Which dialog is open, if any. */
  modal: Modal;
  /** Open group context menu, with the cursor position that opened it. */
  groupMenu: { x: number; y: number; groupId: string } | null;
  /** Open tab context menu. */
  tabMenu: { x: number; y: number; tabId: string } | null;
  /** Tab waiting to be dropped into a pane, while the slot overlay is up. */
  paneAssign: string | null;
  /** Where the tab list is drawn. */
  layout: Layout;
  /** Edge of the window holding the limits bar. */
  barPosition: BarPosition;
  /** Thickness in pixels of the terminal frame in the group's colour. */
  terminalBorder: number;
  /** How the terminal area is divided. */
  splitMode: SplitMode;
  /** Tab shown in each pane, by slot. */
  panes: Array<string | null>;
  /** Slot that receives the next activated tab. */
  focusedPane: number;
  /** Questions Claude is waiting on, shown next to the permissions. */
  questions: QuestionItem[];

  addGroup: (name?: string, folderId?: string | null) => string;
  setGroupFolder: (id: string, folderId: string | null) => void;
  renameGroup: (id: string, name: string) => void;
  cycleGroupColor: (id: string) => void;
  toggleGroupCollapsed: (id: string) => void;
  removeGroup: (id: string) => void;

  addTab: (
    groupId: string,
    opts?: { cwd?: string | null; claudeSessionId?: string; title?: string; customTitle?: boolean },
  ) => string;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  renameTab: (id: string, title: string) => void;
  moveTab: (id: string, groupId: string) => void;
  patchTab: (id: string, patch: Partial<Tab>) => void;

  toggleSidebar: () => void;
  toggleEvents: () => void;
  pushEvent: (e: HookEvent) => void;
  clearEvents: () => void;
  setSetup: (s: HookSetup) => void;
  applyStatus: (e: StatusEnvelope) => void;
  addPermission: (p: PermissionRequest) => void;
  dropPermission: (id: string) => void;
  markAlerted: (tabId: string) => void;
  clearAlerted: (tabId: string) => void;
  togglePinned: (sessionId: string) => void;
  addFolder: (name: string, path: string) => string;
  renameFolder: (id: string, name: string) => void;
  removeFolder: (id: string) => void;
  setDefaultFolder: (id: string | null) => void;
  openModal: (m: Modal) => void;
  setLayout: (l: Layout) => void;
  setBarPosition: (p: BarPosition) => void;
  openGroupMenu: (m: { x: number; y: number; groupId: string } | null) => void;
  setGroupColor: (id: string, color: string) => void;
  ungroupTabs: (id: string) => void;
  closeGroup: (id: string) => void;
  setTerminalBorder: (px: number) => void;
  setSplitMode: (m: SplitMode) => void;
  focusPane: (index: number) => void;
  openTabMenu: (m: { x: number; y: number; tabId: string } | null) => void;
  startPaneAssign: (tabId: string | null) => void;
  assignToPane: (tabId: string, index: number) => void;
  addQuestion: (q: QuestionItem) => void;
  dropQuestion: (match: { id?: string; toolUseId?: string; tabId?: string }) => void;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      groups: [],
      tabs: [],
      activeTabId: null,
      sidebarOpen: true,
      eventsOpen: true,
      events: [],
      setup: null,
      statusByTab: {},
      rateLimits: null,
      permissions: [],
      alerted: [],
      pinned: [],
      folders: [],
      defaultFolderId: null,
      modal: null,
      groupMenu: null,
      tabMenu: null,
      paneAssign: null,
      layout: "sidebar",
      barPosition: "top",
      terminalBorder: 1,
      splitMode: "single",
      panes: [null, null, null, null],
      focusedPane: 0,
      questions: [],

      addGroup: (name, folderId = null) => {
        const id = newId();
        const color = GROUP_COLORS[get().groups.length % GROUP_COLORS.length];
        set((s) => {
          const created: Group = {
            id,
            name: name ?? `Grupo ${s.groups.filter((g) => !g.fixed).length + 1}`,
            color,
            collapsed: false,
            folderId,
          };
          const at = s.groups.findIndex((g) => g.id === UNGROUPED_ID);
          const groups = [...s.groups];
          groups.splice(at === -1 ? groups.length : at, 0, created);
          return { groups };
        });
        return id;
      },
      setGroupFolder: (id, folderId) =>
        set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, folderId } : g)) })),
      renameGroup: (id, name) =>
        set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, name } : g)) })),
      cycleGroupColor: (id) =>
        set((s) => ({
          groups: s.groups.map((g) => {
            if (g.id !== id) return g;
            const next = (GROUP_COLORS.indexOf(g.color) + 1) % GROUP_COLORS.length;
            return { ...g, color: GROUP_COLORS[next] };
          }),
        })),
      toggleGroupCollapsed: (id) =>
        set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)) })),
      removeGroup: (id) =>
        set((s) => {
          if (id === UNGROUPED_ID) return s;
          if (s.tabs.some((t) => t.groupId === id)) return s;
          return { groups: s.groups.filter((g) => g.id !== id) };
        }),

      addTab: (groupId, opts = {}) => {
        const id = newId();
        const tab: Tab = {
          id,
          groupId,
          title: opts.title ?? DEFAULT_TAB_TITLE,
          customTitle: opts.customTitle ?? false,
          cwd: opts.cwd ?? null,
          claudeSessionId: opts.claudeSessionId ?? null,
          state: "shell",
          lastEventAt: null,
          pendingMessage: null,
          transcriptPath: null,
          claudeTitle: null,
        };
        set((s) => {
          const panes = [...s.panes];
          panes[s.focusedPane] = id;
          return { tabs: [...s.tabs, tab], activeTabId: id, panes };
        });
        return id;
      },
      closeTab: (id) =>
        set((s) => {
          const tabs = s.tabs.filter((t) => t.id !== id);
          const panes = s.panes.map((p) => (p === id ? null : p));
          const { [id]: _dropped, ...statusByTab } = s.statusByTab;
          const permissions = s.permissions.filter((p) => p.tab_id !== id);
          const questions = s.questions.filter((q) => q.tab_id !== id);
          const alerted = s.alerted.filter((a) => a !== id);
          const activeTabId =
            s.activeTabId === id ? (tabs.find((t) => t.state !== "dormant") ?? tabs[0])?.id ?? null : s.activeTabId;
          return { tabs, activeTabId, panes, statusByTab, permissions, questions, alerted };
        }),
      activateTab: (id) =>
        set((s) => {
          const panes = [...s.panes];
          // A tab already on screen keeps its pane and takes focus there.
          const existing = panes.indexOf(id);
          const target = existing !== -1 && existing < paneCount(s.splitMode) ? existing : s.focusedPane;
          panes[target] = id;
          return {
            activeTabId: id,
            focusedPane: target,
            panes,
            tabs: s.tabs.map((t) => (t.id === id && t.state === "dormant" ? { ...t, state: "shell" as TabState } : t)),
          };
        }),
      renameTab: (id, title) => {
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title, customTitle: true } : t)) }));
        // Mirror the rename into Claude Code, but only with a session sitting
        // idle at its prompt: typing into a busy session would queue the line,
        // and into a plain shell would just print an error.
        const tab = get().tabs.find((t) => t.id === id);
        if (!tab?.claudeSessionId || tab.state !== "waiting") return;
        const safe = title.replace(/[\r\n]+/g, " ").trim().slice(0, 80);
        if (!safe) return;
        void invoke("pty_write", { id, data: `/rename ${safe}\r` }).catch(() => {});
      },
      moveTab: (id, groupId) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, groupId } : t)) })),
      patchTab: (id, patch) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleEvents: () => set((s) => ({ eventsOpen: !s.eventsOpen })),
      pushEvent: (e) => set((s) => ({ events: [e, ...s.events].slice(0, 500) })),
      clearEvents: () => set({ events: [] }),
      setSetup: (setup) => set({ setup }),
      applyStatus: (e) =>
        set((s) => {
          const next: Partial<Store> = {};
          if (e.tab_id) next.statusByTab = { ...s.statusByTab, [e.tab_id]: e.payload };
          const rl = e.payload.rate_limits;
          if (rl && (!s.rateLimits || e.received_at >= s.rateLimits.receivedAt)) {
            next.rateLimits = { ...rl, receivedAt: e.received_at, fromTabId: e.tab_id };
          }
          return next;
        }),
      addPermission: (p) => set((s) => ({ permissions: [...s.permissions, p] })),
      dropPermission: (id) => set((s) => ({ permissions: s.permissions.filter((p) => p.id !== id) })),
      markAlerted: (tabId) =>
        set((s) => (s.alerted.includes(tabId) ? s : { alerted: [...s.alerted, tabId] })),
      clearAlerted: (tabId) => set((s) => ({ alerted: s.alerted.filter((a) => a !== tabId) })),
      addFolder: (name, path) => {
        const existing = get().folders.find((f) => f.path === path);
        if (existing) return existing.id;
        const id = newId();
        set((s) => ({
          folders: [...s.folders, { id, name, path }],
          defaultFolderId: s.defaultFolderId ?? id,
        }));
        return id;
      },
      renameFolder: (id, name) =>
        set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)) })),
      removeFolder: (id) =>
        set((s) => ({
          folders: s.folders.filter((f) => f.id !== id),
          defaultFolderId: s.defaultFolderId === id ? null : s.defaultFolderId,
          groups: s.groups.map((g) => (g.folderId === id ? { ...g, folderId: null } : g)),
        })),
      setDefaultFolder: (id) => set({ defaultFolderId: id }),
      openModal: (modal) => set({ modal }),
      setLayout: (layout) => set({ layout }),
      setBarPosition: (barPosition) => set({ barPosition }),
      openGroupMenu: (groupMenu) => set({ groupMenu }),
      setGroupColor: (id, color) =>
        set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, color } : g)) })),
      ungroupTabs: (id) =>
        set((s) => {
          if (id === UNGROUPED_ID) return s;
          return {
            tabs: s.tabs.map((t) => (t.groupId === id ? { ...t, groupId: UNGROUPED_ID } : t)),
            groups: s.groups.filter((g) => g.id !== id),
          };
        }),
      closeGroup: (id) =>
        set((s) => {
          if (id === UNGROUPED_ID) return s;
          const doomed = new Set(s.tabs.filter((t) => t.groupId === id).map((t) => t.id));
          const tabs = s.tabs.filter((t) => !doomed.has(t.id));
          const statusByTab = Object.fromEntries(
            Object.entries(s.statusByTab).filter(([k]) => !doomed.has(k)),
          );
          return {
            tabs,
            groups: s.groups.filter((g) => g.id !== id),
            statusByTab,
            permissions: s.permissions.filter((p) => !p.tab_id || !doomed.has(p.tab_id)),
            questions: s.questions.filter((q) => !q.tab_id || !doomed.has(q.tab_id)),
            alerted: s.alerted.filter((a) => !doomed.has(a)),
            activeTabId: doomed.has(s.activeTabId ?? "") ? (tabs[0]?.id ?? null) : s.activeTabId,
          };
        }),
      setTerminalBorder: (terminalBorder) => set({ terminalBorder }),
      setSplitMode: (splitMode) =>
        set((s) => {
          // Fill any pane the new layout exposes with a tab not already shown.
          const panes = [...s.panes];
          const shown = new Set(panes.filter(Boolean) as string[]);
          const spare = s.tabs.filter((t) => t.state !== "dormant" && !shown.has(t.id));
          for (let i = 0; i < paneCount(splitMode); i++) {
            if (!panes[i] || !s.tabs.some((t) => t.id === panes[i])) {
              const next = spare.shift();
              panes[i] = next ? next.id : null;
              if (next) shown.add(next.id);
            }
          }
          const focusedPane = Math.min(s.focusedPane, paneCount(splitMode) - 1);
          return { splitMode, panes, focusedPane, activeTabId: panes[focusedPane] ?? s.activeTabId };
        }),
      focusPane: (index) =>
        set((s) => ({ focusedPane: index, activeTabId: s.panes[index] ?? s.activeTabId })),
      openTabMenu: (tabMenu) => set({ tabMenu }),
      startPaneAssign: (paneAssign) => set({ paneAssign, tabMenu: null }),
      assignToPane: (tabId, index) =>
        set((s) => {
          const panes = [...s.panes];
          // A tab can only be in one pane; free the one it came from.
          const from = panes.indexOf(tabId);
          if (from !== -1) panes[from] = null;
          panes[index] = tabId;
          return {
            panes,
            paneAssign: null,
            focusedPane: index,
            activeTabId: tabId,
            tabs: s.tabs.map((t) => (t.id === tabId && t.state === "dormant" ? { ...t, state: "shell" as TabState } : t)),
          };
        }),
      addQuestion: (q) => set((s) => ({ questions: [...s.questions, q] })),
      dropQuestion: ({ id, toolUseId, tabId }) =>
        set((s) => ({
          questions: s.questions.filter(
            (q) =>
              !(
                (id !== undefined && q.id === id) ||
                (toolUseId !== undefined && q.tool_use_id === toolUseId) ||
                (tabId !== undefined && q.tab_id === tabId)
              ),
          ),
        })),
      togglePinned: (sessionId) =>
        set((s) => ({
          pinned: s.pinned.includes(sessionId)
            ? s.pinned.filter((p) => p !== sessionId)
            : [sessionId, ...s.pinned],
        })),
    }),
    {
      name: "claude-terminal-layout",
      version: 2,
      storage: createJSONStorage(() => fileStorage),
      // main.tsx rehydrates before the first render; see persist.ts.
      skipHydration: true,
      // v1 layouts predate pinned sessions; everything else carries over.
      migrate: (persisted) => {
        const prev = (persisted ?? {}) as Record<string, unknown>;
        return {
          ...prev,
          pinned: Array.isArray(prev.pinned) ? prev.pinned : [],
          folders: Array.isArray(prev.folders) ? prev.folders : [],
          groups: (Array.isArray(prev.groups) ? prev.groups : []).map((g: Record<string, unknown>) => ({
            ...g,
            folderId: typeof g.folderId === "string" ? g.folderId : null,
          })),
        } as never;
      },
      // Ptys do not survive a restart, so every tab comes back dormant.
      partialize: (s) => ({
        groups: s.groups,
        tabs: s.tabs.map((t) => ({ ...t, state: "dormant" as TabState, pendingMessage: null })),
        activeTabId: s.activeTabId,
        sidebarOpen: s.sidebarOpen,
        eventsOpen: s.eventsOpen,
        pinned: s.pinned,
        folders: s.folders,
        defaultFolderId: s.defaultFolderId,
        layout: s.layout,
        barPosition: s.barPosition,
        terminalBorder: s.terminalBorder,
        splitMode: s.splitMode,
        panes: s.panes,
      }),
    },
  ),
);

/** Adds the catch-all group when missing and keeps it last in the list. */
export function ensureUngrouped(): void {
  const s = useStore.getState();
  const existing = s.groups.find((g) => g.id === UNGROUPED_ID);
  const rest = s.groups.filter((g) => g.id !== UNGROUPED_ID);
  const catchAll: Group = existing ?? {
    id: UNGROUPED_ID,
    name: UNGROUPED_NAME,
    color: UNGROUPED_COLOR,
    collapsed: false,
    folderId: null,
    fixed: true,
  };
  if (existing && rest.length === s.groups.length - 1 && s.groups[s.groups.length - 1]?.id === UNGROUPED_ID) {
    return;
  }
  useStore.setState({ groups: [...rest, catchAll] });
}

/**
 * Opens a session in a group: straight into the group's base folder when it has
 * one, otherwise through the folder picker.
 */
export function openSessionInGroup(groupId: string): void {
  const s = useStore.getState();
  const group = s.groups.find((g) => g.id === groupId);
  // The catch-all group has no folder of its own; it always uses the base folder.
  const wanted = group?.fixed ? s.defaultFolderId : group?.folderId;
  const folder = wanted ? s.folders.find((f) => f.id === wanted) : undefined;
  if (folder) {
    s.addTab(groupId, { cwd: folder.path, title: folder.name });
    return;
  }
  s.openModal({ kind: "pickFolder", groupId });
}

/** Ensures at least one group exists and returns the group for new tabs. */
export function defaultGroupId(): string {
  const s = useStore.getState();
  const active = s.tabs.find((t) => t.id === s.activeTabId);
  if (active) return active.groupId;
  if (s.groups.some((g) => g.id === UNGROUPED_ID)) return UNGROUPED_ID;
  if (s.groups[0]) return s.groups[0].id;
  ensureUngrouped();
  return UNGROUPED_ID;
}
