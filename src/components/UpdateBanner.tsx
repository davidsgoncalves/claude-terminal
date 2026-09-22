import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type Phase = "idle" | "found" | "downloading" | "ready" | "error";

/** Checks GitHub releases on start and offers the update in a small bar. */
export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const found = await check();
        if (!cancelled && found) {
          setUpdate(found);
          setPhase("found");
        }
      } catch (err) {
        // A missing release or no network is normal; stay quiet about it.
        console.warn("update check failed", err);
      }
    };
    void run();
    // Checks again every six hours for a long-lived window.
    const id = setInterval(run, 6 * 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!update || phase === "idle") return null;

  const install = async () => {
    setPhase("downloading");
    let total = 0;
    let got = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          got += event.data.chunkLength;
          if (total > 0) setProgress(Math.round((got / total) * 100));
        }
        if (event.event === "Finished") setPhase("ready");
      });
      setPhase("ready");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className={`update-bar ${phase}`}>
      {phase === "found" && (
        <>
          <span>
            Versão <strong>{update.version}</strong> disponível.
          </span>
          <button className="primary" onClick={() => void install()}>
            Atualizar
          </button>
          <button className="ghost auto" onClick={() => setUpdate(null)}>
            Depois
          </button>
        </>
      )}
      {phase === "downloading" && <span>Baixando atualização… {progress}%</span>}
      {phase === "ready" && (
        <>
          <span>Atualização instalada.</span>
          <button className="primary" onClick={() => void relaunch()}>
            Reiniciar agora
          </button>
        </>
      )}
      {phase === "error" && (
        <>
          <span>Falha ao atualizar: {message}</span>
          <button className="ghost auto" onClick={() => setUpdate(null)}>
            Fechar
          </button>
        </>
      )}
    </div>
  );
}
