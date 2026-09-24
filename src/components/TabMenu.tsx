import { useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { closeDetachedWindow } from "../lib/detach";

/** Right-click menu for a tab or a terminal pane. */
export function TabMenu() {
  const { tabMenu, openTabMenu, startPaneAssign, closeTab, tabs, detached, detachTab } = useStore();
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
  const isDetached = detached.includes(tab.id);

  return (
    <div
      ref={ref}
      className="group-menu"
      style={{ left: Math.min(tabMenu.x, window.innerWidth - 230), top: tabMenu.y + 4 }}
    >
      <div className="menu-heading">{tab.title}</div>
      {isDetached ? (
        <button
          className="menu-item"
          onClick={() => {
            closeDetachedWindow(tab.id);
            openTabMenu(null);
          }}
        >
          Voltar para esta janela
        </button>
      ) : (
        <>
          <button className="menu-item" onClick={() => startPaneAssign(tab.id)}>
            Colocar em um painel…
          </button>
          {tab.state !== "dormant" && (
            <button
              className="menu-item"
              onClick={() => {
                detachTab(tab.id);
                openTabMenu(null);
              }}
            >
              Mover para nova janela
            </button>
          )}
        </>
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
