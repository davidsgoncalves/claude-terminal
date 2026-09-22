import { useState } from "react";
import { useStore } from "../lib/store";
import type { HookEvent } from "../lib/types";

function eventLabel(e: HookEvent): string {
  const p = e.payload;
  const name = String(p.hook_event_name ?? "?");
  const extra =
    (p.tool_name as string | undefined) ??
    (p.notification_type as string | undefined) ??
    (p.source as string | undefined) ??
    "";
  return extra ? `${name} · ${extra}` : name;
}

export function EventsList() {
  const { events, clearEvents, tabs, activeTabId } = useStore();
  const [onlyActive, setOnlyActive] = useState(false);
  const active = tabs.find((t) => t.id === activeTabId);
  const titleOf = (tabId: string | null) => tabs.find((t) => t.id === tabId)?.title ?? tabId ?? "?";
  const visible = onlyActive && active ? events.filter((e) => e.tab_id === active.id) : events;

  return (
    <>
      <section className="actions">
        <div className="row">
          <button className="ghost" onClick={clearEvents} disabled={events.length === 0}>
            Limpar
          </button>
          <label className="check">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            só esta aba
          </label>
        </div>
      </section>
      <section className="events">
        {visible.length === 0 && <p className="hint">Nenhum evento.</p>}
        <ul>
          {visible.map((e, i) => (
            <li key={`${e.received_at}-${i}`}>
              <div className="row">
                <span className="name">{eventLabel(e)}</span>
                <time>{new Date(e.received_at).toLocaleTimeString()}</time>
              </div>
              <div className="meta">{titleOf(e.tab_id)}</div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
