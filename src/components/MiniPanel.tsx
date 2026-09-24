import { useEffect, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { MAIN_LABEL } from "../lib/detach";
import { MINI_ACTIVATE, MINI_BOUNDS, MINI_CLOSED, MINI_READY, MINI_STATE, type MiniRow } from "../lib/mini";
import { STATE_LABEL } from "../lib/types";

const BOUNDS_DELAY_MS = 400;

/** Floating window with one line per live tab; a click jumps to that tab. */
export function MiniPanel() {
  const [rows, setRows] = useState<MiniRow[]>([]);

  useEffect(() => {
    const win = getCurrentWebviewWindow();
    const unState = listen<MiniRow[]>(MINI_STATE, (ev) => setRows(ev.payload));
    void unState.then(() => emitTo(MAIN_LABEL, MINI_READY));

    // Reported in logical pixels, which is what a new window is opened with.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const report = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const [pos, size, scale] = await Promise.all([win.outerPosition(), win.innerSize(), win.scaleFactor()]);
        void emitTo(MAIN_LABEL, MINI_BOUNDS, {
          x: Math.round(pos.x / scale),
          y: Math.round(pos.y / scale),
          width: Math.round(size.width / scale),
          height: Math.round(size.height / scale),
        });
      }, BOUNDS_DELAY_MS);
    };
    const unMoved = win.onMoved(report);
    const unResized = win.onResized(report);
    const unClose = win.onCloseRequested(() => emitTo(MAIN_LABEL, MINI_CLOSED));

    return () => {
      clearTimeout(timer);
      for (const p of [unState, unMoved, unResized, unClose]) void p.then((u) => u());
    };
  }, []);

  return (
    <div className="mini">
      {rows.length === 0 ? (
        <p className="mini-empty">Nenhuma sessão aberta.</p>
      ) : (
        <ul className="mini-list">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`mini-row state-${r.state}`}
              style={{ ["--group-color" as string]: r.color }}
              title={`${r.group} · ${STATE_LABEL[r.state]}`}
              onClick={() => void emitTo(MAIN_LABEL, MINI_ACTIVATE, { id: r.id })}
            >
              <span className="dot" />
              <span className="mini-title">{r.title}</span>
              {r.agents > 0 && <span className="mini-agents">⑂ {r.agents}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
