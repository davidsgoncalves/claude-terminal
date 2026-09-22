import { useEffect } from "react";
import { useStore } from "../lib/store";
import { paneCount, paneRect } from "../lib/types";

/** Numbered slots drawn over the terminals while a tab is being placed. */
export function PaneOverlay() {
  const { paneAssign, startPaneAssign, assignToPane, splitMode, panes, tabs } = useStore();

  useEffect(() => {
    if (!paneAssign) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        startPaneAssign(null);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= paneCount(splitMode)) {
        e.preventDefault();
        assignToPane(paneAssign, n - 1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [paneAssign, splitMode, assignToPane, startPaneAssign]);

  if (!paneAssign) return null;
  const moving = tabs.find((t) => t.id === paneAssign);

  return (
    <div className="pane-overlay" onClick={() => startPaneAssign(null)}>
      {Array.from({ length: paneCount(splitMode) }, (_, i) => {
        const occupant = tabs.find((t) => t.id === panes[i]);
        return (
          <button
            key={i}
            className="pane-slot"
            style={paneRect(splitMode, i)}
            onClick={(e) => {
              e.stopPropagation();
              assignToPane(paneAssign, i);
            }}
          >
            <span className="slot-number">{i + 1}</span>
            <span className="slot-occupant">{occupant ? occupant.title : "vazio"}</span>
          </button>
        );
      })}
      <div className="pane-overlay-hint">
        Escolha o painel para <strong>{moving?.title ?? "a aba"}</strong> · 1 a {paneCount(splitMode)} ou Esc
      </div>
    </div>
  );
}
