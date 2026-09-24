import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../lib/store";
import { terminals } from "../lib/terminals";
import type { SavedPrompt } from "../lib/types";

/** Pasted as one block, so line breaks in the prompt do not submit it early. */
function pasteInto(tabId: string, text: string, submit: boolean): void {
  const data = `\x1b[200~${text}\x1b[201~${submit ? "\r" : ""}`;
  void invoke("pty_write", { id: tabId, data }).catch(() => {});
}

/** Cmd+Shift+P: drop a saved prompt into the active session. */
export function PromptPicker({ onClose }: { onClose: () => void }) {
  const { prompts, activeTabId, tabs, openModal } = useStore();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const tab = tabs.find((t) => t.id === activeTabId && t.state !== "dormant");

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return prompts.filter((p) => {
      const hay = `${p.name} ${p.text}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [prompts, query]);

  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    listRef.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const pick = (p: SavedPrompt | undefined, submit: boolean) => {
    if (!p || !tab) return;
    onClose();
    pasteInto(tab.id, p.text, submit);
    terminals.get(tab.id)?.focus();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal switcher" onMouseDown={(e) => e.stopPropagation()}>
        <input
          className="switcher-input"
          autoFocus
          placeholder={tab ? `Prompt para ${tab.title}` : "Nenhuma sessão ativa"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter") {
              pick(results[cursor], e.metaKey);
            }
          }}
        />
        {prompts.length === 0 ? (
          <p className="hint pad">Nenhum prompt salvo ainda.</p>
        ) : results.length === 0 ? (
          <p className="hint pad">Nenhum prompt encontrado.</p>
        ) : (
          <ul className="switcher-list" ref={listRef}>
            {results.map((p, i) => (
              <li
                key={p.id}
                className={`switcher-row ${i === cursor ? "on" : ""}`}
                onMouseMove={() => setCursor(i)}
                onClick={(e) => pick(p, e.metaKey)}
              >
                <span className="switcher-main">
                  <span className="switcher-title">{p.name}</span>
                  <span className="switcher-sub">{p.text.replace(/\s+/g, " ")}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <footer className="switcher-foot">
          <span>Enter insere · ⌘Enter insere e envia</span>
          <button className="link" onClick={() => openModal({ kind: "settings", tab: "prompts" })}>
            Gerenciar prompts
          </button>
        </footer>
      </div>
    </div>
  );
}
