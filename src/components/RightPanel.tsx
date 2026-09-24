import { useState } from "react";
import { useStore } from "../lib/store";
import { PermissionQueue } from "./PermissionQueue";
import { SessionsBrowser } from "./SessionsBrowser";
import { EventsList } from "./EventsPanel";
import { shortcutLabel } from "../lib/shortcuts";

type PanelTab = "queue" | "sessions" | "events";

export function RightPanel() {
  const { eventsOpen, toggleEvents, permissions, questions, commands } = useStore();
  const pending = permissions.length + questions.length + commands.length;
  const [panel, setPanel] = useState<PanelTab>("queue");

  if (!eventsOpen) {
    return (
      <aside className="events-panel collapsed">
        <button className="icon-btn" title={`Mostrar painel (${shortcutLabel("events")})`} onClick={toggleEvents}>
          «
        </button>
        {pending > 0 && (
          <span className="badge">{pending}</span>
        )}
      </aside>
    );
  }

  const TABS: Array<{ key: PanelTab; label: string; badge?: number }> = [
    { key: "queue", label: "Fila", badge: pending },
    { key: "sessions", label: "Sessões" },
    { key: "events", label: "Eventos" },
  ];

  return (
    <aside className="events-panel">
      <header className="panel-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={panel === t.key ? "active" : ""}
            onClick={() => setPanel(t.key)}
          >
            {t.label}
            {t.badge ? <span className="badge">{t.badge}</span> : null}
          </button>
        ))}
        <button className="icon-btn" title={`Recolher (${shortcutLabel("events")})`} onClick={toggleEvents}>
          »
        </button>
      </header>

      {panel === "queue" && (
        <div className="panel-body">
          <PermissionQueue />
        </div>
      )}
      {panel === "sessions" && (
        <div className="panel-body">
          <SessionsBrowser />
        </div>
      )}
      {panel === "events" && (
        <div className="panel-body">
          <EventsList />
        </div>
      )}
    </aside>
  );
}
