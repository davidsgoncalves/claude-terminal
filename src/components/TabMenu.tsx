import { useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { paneCount } from "../lib/types";

/** Right-click menu for a tab or a terminal pane. */
export function TabMenu() {
  const { tabMenu, openTabMenu, startPaneAssign, closeTab, tabs, splitMode, panes } = useStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tabMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) openTabMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openTabMenu(null);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [tabMenu, openTabMenu]);

  if (!tabMenu) return null;
  const tab = tabs.find((t) => t.id === tabMenu.tabId);
  if (!tab) return null;
  const slot = panes.slice(0, paneCount(splitMode)).indexOf(tab.id);

  return (
    <div
      ref={ref}
      className="group-menu"
      style={{ left: Math.min(tabMenu.x, window.innerWidth - 230), top: tabMenu.y + 4 }}
    >
      <div className="menu-heading">{tab.title}</div>
      <button className="menu-item" onClick={() => startPaneAssign(tab.id)}>
        Colocar em um painel…
      </button>
      {slot !== -1 && (
        <button className="menu-item" onClick={() => {
          useStore.getState().assignToPane(tab.id, slot);
          openTabMenu(null);
        }}>
          Está no painel {slot + 1}
        </button>
      )}
      <div className="menu-sep" />
      <button
        className="menu-item danger"
        onClick={() => {
          closeTab(tab.id);
          openTabMenu(null);
        }}
      >
        Fechar aba
      </button>
    </div>
  );
}
