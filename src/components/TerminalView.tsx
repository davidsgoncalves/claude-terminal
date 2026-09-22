import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { terminals } from "../lib/terminals";
import { takeRestored } from "../lib/restored";
import type { Tab } from "../lib/types";

interface Props {
  tab: Tab;
  /** Drawn on screen; a tab in no pane stays mounted but hidden. */
  visible: boolean;
  /** Receives keyboard focus and the highlighted frame. */
  focused: boolean;
  /** Absolute placement inside the terminal area. */
  rect: { left: string; top: string; width: string; height: string };
  color: string;
  onFocus: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/** Cmd shortcuts the app owns; xterm ignores them so they bubble up to the window handler. */
const APP_SHORTCUTS = new Set(["t", "w", "b", "e", "1", "2", "3", "4", "5", "6", "7", "8", "9", "[", "]"]);

export function TerminalView({ tab, visible, focused, rect, color, onFocus, onContextMenu }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const term = new Terminal({
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      macOptionIsMeta: true,
      theme: { background: "#0f1115", foreground: "#d6d8de", cursor: "#d97757" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown" || !e.metaKey) return true;
      const key = e.key.toLowerCase();
      if (key === "k" && !e.shiftKey) {
        term.clear();
        return false;
      }
      if (APP_SHORTCUTS.has(key)) return false;
      return true;
    });

    terminals.set(tab.id, term);
    termRef.current = term;
    fitRef.current = fit;

    invoke("pty_spawn", { id: tab.id, cols: term.cols, rows: term.rows, cwd: tab.cwd })
      .then(() => {
        // Only a tab restored from a previous run reopens its Claude session,
        // and only on its first spawn. The PATH shim supplies the settings.
        if (tab.claudeSessionId && takeRestored(tab.id)) {
          invoke("pty_write", { id: tab.id, data: `claude --resume ${tab.claudeSessionId}\r` });
        }
      })
      .catch((e) => term.writeln(`\x1b[31mpty_spawn failed: ${e}\x1b[0m`));

    const dataSub = term.onData((data) => invoke("pty_write", { id: tab.id, data }));

    const observer = new ResizeObserver(() => {
      if (el.offsetParent === null) return;
      fit.fit();
      invoke("pty_resize", { id: tab.id, cols: term.cols, rows: term.rows }).catch(() => {});
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      dataSub.dispose();
      terminals.delete(tab.id);
      term.dispose();
      invoke("pty_kill", { id: tab.id }).catch(() => {});
    };
    // The pty lives as long as the tab id; other tab fields must not respawn it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  useEffect(() => {
    if (!visible) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    requestAnimationFrame(() => {
      fit.fit();
      invoke("pty_resize", { id: tab.id, cols: term.cols, rows: term.rows }).catch(() => {});
      if (focused) term.focus();
    });
  }, [visible, focused, rect.left, rect.top, rect.width, rect.height, tab.id]);

  return (
    <div
      ref={ref}
      className={`term-pane ${focused ? "focused" : ""}`}
      style={{
        display: visible ? "block" : "none",
        ...rect,
        ["--group-color" as string]: color,
      }}
      onMouseDown={onFocus}
      onContextMenu={onContextMenu}
    />
  );
}
