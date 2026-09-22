import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import "./App.css";
import { Sidebar } from "./components/Sidebar";
import { TabStrip } from "./components/TabStrip";
import { TerminalView } from "./components/TerminalView";
import { RightPanel } from "./components/RightPanel";
import { TopBar } from "./components/TopBar";
import { Dialogs } from "./components/Dialogs";
import { GroupMenu } from "./components/GroupMenu";
import { TabMenu } from "./components/TabMenu";
import { UpdateBanner } from "./components/UpdateBanner";
import { PaneOverlay } from "./components/PaneOverlay";
import { EmptyPane } from "./components/EmptyPane";
import { EditorPanel } from "./components/EditorPanel";
import { defaultGroupId, ensureUngrouped, openSessionInGroup, useStore } from "./lib/store";
import { tabPatchFor } from "./lib/hookState";
import { decodeBase64, terminals } from "./lib/terminals";
import { notify } from "./lib/notify";
import { describeTool } from "./lib/describe";
import { syncTabTitle } from "./lib/titles";
import {
  WATCHDOG_MINUTES,
  paneCount,
  paneRect,
  type HookEvent,
  type HookSetup,
  type EditorRequest,
  type PermissionRequest,
  type QuestionItem,
  type StatusEnvelope,
} from "./lib/types";

type PtyData = { id: string; data: string };
type PermissionResolved = { id: string; decision: string | null };

const QUESTION_TOOL = "AskUserQuestion";

/**
 * Claude's question tool has no hook of its own, so the queue picks it up from
 * the tool-use events that bracket it.
 */
function trackQuestions(e: HookEvent, tabId: string): void {
  const p = e.payload;
  if (p.tool_name !== QUESTION_TOOL) return;
  const store = useStore.getState();
  const toolUseId = typeof p.tool_use_id === "string" ? p.tool_use_id : null;
  const name = String(p.hook_event_name ?? "");

  if (name === "PreToolUse") {
    const input = (p.tool_input ?? {}) as { questions?: QuestionItem["questions"] };
    if (!Array.isArray(input.questions) || input.questions.length === 0) return;
    store.addQuestion({
      id: `q-${e.received_at}-${toolUseId ?? tabId}`,
      tab_id: tabId,
      received_at: e.received_at,
      tool_use_id: toolUseId,
      questions: input.questions,
    });
    const first = input.questions[0]?.question ?? "Pergunta";
    void notify("Claude perguntou", first);
    return;
  }
  if (name === "PostToolUse") {
    store.dropQuestion(toolUseId ? { toolUseId } : { tabId });
  }
}

function useBackendBridge() {
  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    const store = useStore.getState;

    invoke<HookSetup>("hooks_setup").then(store().setSetup).catch(console.error);

    listen<PtyData>("pty-data", (ev) => {
      terminals.get(ev.payload.id)?.write(decodeBase64(ev.payload.data));
    }).then((u) => unlisteners.push(u));

    listen<{ id: string }>("pty-exit", (ev) => {
      const tab = store().tabs.find((t) => t.id === ev.payload.id);
      if (tab) store().patchTab(tab.id, { state: "dormant", pendingMessage: null });
    }).then((u) => unlisteners.push(u));

    listen<StatusEnvelope>("statusline-event", (ev) => {
      store().applyStatus(ev.payload);
    }).then((u) => unlisteners.push(u));

    listen<HookEvent>("hook-event", (ev) => {
      const e = ev.payload;
      store().pushEvent(e);
      if (!e.tab_id) return;
      const tab = store().tabs.find((t) => t.id === e.tab_id);
      if (!tab) return;
      const patch = tabPatchFor(tab, e);
      if (!patch) return;
      store().patchTab(tab.id, patch);
      if (patch.state && patch.state !== tab.state) store().clearAlerted(tab.id);
      if (patch.state === "shell" || patch.state === "dormant") {
        store().dropQuestion({ tabId: tab.id });
      }
      if (patch.state === "waiting" && tab.state === "working") {
        void notify("Sessão terminou", patch.title ?? tab.title);
      }
      trackQuestions(e, tab.id);
      // A /rename inside Claude lands in the transcript; pick it up on the
      // events that bracket a turn rather than on every tool call.
      const name = String(e.payload.hook_event_name ?? "");
      if (name === "SessionStart" || name === "Stop" || name === "UserPromptSubmit") {
        void syncTabTitle(tab.id);
      }
    }).then((u) => unlisteners.push(u));

    listen<PermissionRequest>("permission-request", (ev) => {
      const req = ev.payload;
      store().addPermission(req);
      const tab = store().tabs.find((t) => t.id === req.tab_id);
      const summary = describeTool(req.payload.tool_name, req.payload.tool_input);
      store().patchTab(req.tab_id ?? "", {
        state: "permission",
        pendingMessage: `${req.payload.tool_name ?? "ferramenta"}: ${summary}`,
      });
      void notify(`Permissão: ${req.payload.tool_name ?? "ferramenta"}`, `${tab?.title ?? "sessão"} · ${summary}`);
    }).then((u) => unlisteners.push(u));

    listen<PermissionResolved>("permission-resolved", (ev) => {
      store().dropPermission(ev.payload.id);
    }).then((u) => unlisteners.push(u));

    return () => unlisteners.forEach((u) => u());
  }, []);
}

/**
 * `/rename` inside Claude fires no hook, so the transcript is checked on a
 * timer as well as on session events.
 */
function useTitlePoll() {
  useEffect(() => {
    const id = setInterval(() => {
      for (const tab of useStore.getState().tabs) {
        if (tab.state !== "dormant" && tab.transcriptPath) void syncTabTitle(tab.id);
      }
    }, 8_000);
    return () => clearInterval(id);
  }, []);
}

/** Flags a tab that has been waiting on the human for too long. */
function useWatchdog() {
  useEffect(() => {
    const tick = () => {
      const s = useStore.getState();
      const threshold = WATCHDOG_MINUTES * 60_000;
      for (const tab of s.tabs) {
        const idle = tab.state === "permission" || tab.state === "waiting";
        const since = tab.lastEventAt ? Date.now() - tab.lastEventAt : 0;
        if (idle && since > threshold && !s.alerted.includes(tab.id)) {
          s.markAlerted(tab.id);
          const minutes = Math.round(since / 60_000);
          void notify("Sessão parada", `${tab.title} há ${minutes} min sem resposta`, true);
        }
      }
    };
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, []);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      const s = useStore.getState();
      const key = e.key.toLowerCase();
      const live = s.tabs.filter((t) => t.state !== "dormant");
      const idx = live.findIndex((t) => t.id === s.activeTabId);

      const handled = (() => {
        if (key === "t" && !e.shiftKey) return void openSessionInGroup(defaultGroupId());
        if (key === "w" && !e.shiftKey) return void (s.activeTabId && s.closeTab(s.activeTabId));
        if (key === "b") return void s.toggleSidebar();
        if (key === "e") return void s.toggleEvents();
        if (key === ",") return void s.openModal({ kind: "settings" });
        if (/^[1-9]$/.test(key)) {
          const t = live[Number(key) - 1];
          return void (t && s.activateTab(t.id));
        }
        if (e.shiftKey && (key === "[" || key === "]") && live.length > 1) {
          const next = (idx + (key === "]" ? 1 : -1) + live.length) % live.length;
          return void s.activateTab(live[next].id);
        }
        return "skip";
      })();
      if (handled !== "skip") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function useEditorRequests(): [EditorRequest | null, () => void] {
  const [request, setRequest] = useState<EditorRequest | null>(null);
  useEffect(() => {
    const p = listen<EditorRequest>("editor-request", (ev) => setRequest(ev.payload));
    return () => {
      void p.then((un) => un());
    };
  }, []);
  return [request, () => setRequest(null)];
}

function App() {
  const [editorRequest, closeEditor] = useEditorRequests();
  useBackendBridge();
  useTitlePoll();
  useWatchdog();
  useShortcuts();
  const tabs = useStore((s) => s.tabs);

  useEffect(() => {
    ensureUngrouped();
    const s = useStore.getState();
    if (s.tabs.length === 0) {
      openSessionInGroup(defaultGroupId());
      return;
    }
    // Restored tabs all come back dormant; wake the last active one so the app
    // opens on a live terminal instead of the empty state. The rest stay lazy.
    if (!s.tabs.some((t) => t.state !== "dormant")) {
      const target = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
      s.activateTab(target.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = tabs.filter((t) => t.state !== "dormant");
  const layout = useStore((s) => s.layout);
  const groups = useStore((s) => s.groups);
  const borderWidth = useStore((s) => s.terminalBorder);
  const { splitMode, panes, focusedPane, focusPane } = useStore();
  const slots = paneCount(splitMode);
  const paneOf = (tabId: string) => panes.slice(0, slots).indexOf(tabId);
  const colorOf = (tab: (typeof tabs)[number]) =>
    groups.find((g) => g.id === tab.groupId)?.color ?? "transparent";
  // A slot is empty when nothing is assigned or its tab is no longer running.
  const emptySlots = Array.from({ length: slots }, (_, i) => i).filter(
    (i) => !panes[i] || !live.some((t) => t.id === panes[i]),
  );

  return (
    <div className="layout">
      <UpdateBanner />
      <TopBar />
      <div className="body">
        {layout === "sidebar" && <Sidebar />}
        <main className="main">
          {layout === "topbar" && <TabStrip />}
          <div
            className="terminals"
            style={{ ["--terminal-border" as string]: `${borderWidth}px` }}
          >
            {live.map((t) => {
              const slot = paneOf(t.id);
              return (
                <TerminalView
                  key={t.id}
                  tab={t}
                  visible={slot !== -1}
                  focused={slot === focusedPane}
                  rect={paneRect(splitMode, slot === -1 ? 0 : slot)}
                  color={colorOf(t)}
                  onFocus={() => slot !== -1 && focusPane(slot)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    useStore.getState().openTabMenu({ x: e.clientX, y: e.clientY, tabId: t.id });
                  }}
                />
              );
            })}
            {emptySlots.map((i) => (
              <EmptyPane key={`empty-${i}`} index={i} />
            ))}
            {editorRequest && (
              <EditorPanel
                request={editorRequest}
                onDone={closeEditor}
                rect={paneRect(
                  splitMode,
                  Math.max(0, panes.slice(0, slots).indexOf(editorRequest.tab_id ?? "") ),
                )}
              />
            )}
            <PaneOverlay />
          </div>
        </main>
        <RightPanel />
      </div>
      <Dialogs />
      <GroupMenu />
      <TabMenu />
    </div>
  );
}

export default App;
