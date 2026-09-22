import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { findUpdate } from "../lib/update";

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

type Phase = "idle" | "found" | "working" | "ready" | "handed-off" | "restart-failed" | "error";

interface PackageUpdate {
  version: string;
  url: string;
}

/**
 * Offers the update found on GitHub. A macOS build and a Linux AppImage install
 * themselves through the updater; a Linux package install cannot, so the new
 * .deb is downloaded and handed to the system installer instead.
 */
export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [pkg, setPkg] = useState<PackageUpdate | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const look = useCallback(async () => {
    try {
      const found = await findUpdate();
      if (!found) return;
      if (found.kind === "native") setUpdate(found.update);
      else setPkg({ version: found.version, url: found.url });
      setPhase("found");
    } catch (err) {
      // No release yet, or no network: nothing worth interrupting for.
      console.warn("update check failed", err);
    }
  }, []);

  useEffect(() => {
    void look();
    const id = setInterval(() => void look(), CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, [look]);

  if (phase === "idle" || (!update && !pkg)) return null;
  const version = update?.version ?? pkg?.version ?? "";

  const installNative = async () => {
    if (!update) return;
    setPhase("working");
    let total = 0;
    let got = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          got += event.data.chunkLength;
          if (total > 0) setProgress(Math.round((got / total) * 100));
        }
      });
      setPhase("ready");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const installPackage = async () => {
    if (!pkg) return;
    setPhase("working");
    try {
      const response = await fetch(pkg.url);
      if (!response.ok) throw new Error(`download falhou (${response.status})`);
      const total = Number(response.headers.get("content-length") ?? 0);
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total > 0) setProgress(Math.round((got / total) * 100));
      }
      const bytes = new Uint8Array(got);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const result = await invoke<string>("install_package", {
        fileName: pkg.url.split("/").pop() ?? "update.deb",
        bytes: Array.from(bytes),
      });
      setPhase(result === "installed" ? "ready" : "handed-off");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  // Replacing the bundle can leave the old executable path unusable, so a
  // failed restart says so instead of looking like a dead button.
  const restart = async () => {
    try {
      // Reopens the bundle on macOS; falls back to the plugin elsewhere.
      await invoke("restart_app");
    } catch (first) {
      try {
        await relaunch();
        return;
      } catch (err) {
        setMessage(
          [first, err].map((e) => (e instanceof Error ? e.message : String(e))).join(" · "),
        );
        setPhase("restart-failed");
      }
    }
  };

  const dismiss = () => {
    setUpdate(null);
    setPkg(null);
    setPhase("idle");
  };

  return (
    <div className={`update-bar ${phase}`}>
      {phase === "found" && (
        <>
          <span>
            Versão <strong>{version}</strong> disponível.
          </span>
          <button className="primary" onClick={() => void (update ? installNative() : installPackage())}>
            {update ? "Atualizar" : "Baixar e instalar"}
          </button>
          <button className="ghost auto" onClick={dismiss}>
            Depois
          </button>
        </>
      )}
      {phase === "working" && <span>Baixando atualização… {progress}%</span>}
      {phase === "ready" && (
        <>
          <span>Atualização instalada.</span>
          <button className="primary" onClick={() => void restart()}>
            Reiniciar agora
          </button>
          <button className="ghost auto" onClick={dismiss}>
            Depois
          </button>
        </>
      )}
      {phase === "handed-off" && (
        <>
          <span>O instalador do sistema foi aberto com o pacote novo.</span>
          <button className="ghost auto" onClick={dismiss}>
            Fechar
          </button>
        </>
      )}
      {phase === "restart-failed" && (
        <>
          <span>
            Atualização instalada. Feche e abra o app para concluir.
            {message ? ` (${message})` : ""}
          </span>
          <button className="ghost auto" onClick={dismiss}>
            Fechar
          </button>
        </>
      )}
      {phase === "error" && (
        <>
          <span>Falha ao atualizar: {message}</span>
          <button className="ghost auto" onClick={dismiss}>
            Fechar
          </button>
        </>
      )}
    </div>
  );
}
