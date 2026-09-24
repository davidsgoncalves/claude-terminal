import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../lib/store";
import { looksDestructive } from "../lib/describe";
import type { CommandSuggestion } from "../lib/types";

/** Types into Claude's prompt a character at a time, the way a person would. */
async function typeCommand(tabId: string, command: string): Promise<void> {
  const write = (data: string) => invoke("pty_write", { id: tabId, data });
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // "!" on an empty prompt switches Claude Code to shell mode; it has to land
  // on its own, or it is read as part of a paste.
  await write("!");
  await pause(150);
  await write(command);
  await pause(80);
  await write("\r");
}

/** A command Claude asked the user to run; it only runs on a click. */
export function CommandCard({ item, overlay = false }: { item: CommandSuggestion; overlay?: boolean }) {
  const { tabs, activateTab, dropCommand } = useStore();
  const [running, setRunning] = useState(false);
  const tab = tabs.find((t) => t.id === item.tab_id);
  const risky = looksDestructive("Bash", { command: item.command });
  // Typing while Claude works would land in the middle of its turn.
  const ready = tab?.state === "waiting";

  const run = async () => {
    if (!tab) return;
    setRunning(true);
    await typeCommand(tab.id, item.command).catch(() => {});
    dropCommand(item.id);
  };

  return (
    <li className={`perm-item command ${risky ? "risky" : ""} ${overlay ? "overlay" : ""}`}>
      <div className="perm-head">
        <span className="perm-tool">Comando</span>
        {risky && <span className="risk-tag" title="Padrão destrutivo detectado">risco</span>}
      </div>
      {item.reason && <p className="question-text">{item.reason}</p>}
      <code className="perm-cmd" title={item.command}>
        {item.command}
      </code>
      <div className="perm-meta">
        <button className="link" onClick={() => tab && activateTab(tab.id)} title="Ir para a aba">
          {tab?.title ?? "aba fechada"}
        </button>
      </div>
      <div className="perm-actions">
        <button className="deny" onClick={() => dropCommand(item.id)}>
          Descartar
        </button>
        <button
          className="allow"
          disabled={!ready || running}
          onClick={() => void run()}
          title={ready ? "Roda nesta sessão como ! comando" : "Disponível quando a sessão estiver esperando você"}
        >
          {running ? "Executando…" : "Executar"}
        </button>
      </div>
    </li>
  );
}
