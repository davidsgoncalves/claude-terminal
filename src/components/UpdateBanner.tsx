import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const MANIFEST =
  "https://github.com/davidsgoncalves/claude-terminal/releases/latest/download/latest.json";
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

type Phase = "idle" | "found" | "working" | "ready" | "handed-off" | "error";

interface PackageUpdate {
  version: string;
  url: string;
}

/** Compares dotted versions without treating them as numbers end to end. */
function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
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
    const kind = await invoke<string>("install_kind").catch(() => "native");
    if (kind === "package") {
      try {
        const manifest = await fetch(MANIFEST, { cache: "no-store" }).then((r) => r.json());
        const url = manifest?.platforms?.["linux-x86_64-deb"]?.url;
        const current = await getVersion();
        if (url && isNewer(manifest.version, current)) {
          setPkg({ version: manifest.version, url });
          setPhase("found");
        }
      } catch (err) {
        console.warn("update check failed", err);
      }
      return;
    }
    try {
      const found = await check();
      if (found) {
        setUpdate(found);
        setPhase("found");
      }
    } catch (err) {
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
          <button className="primary" onClick={() => void relaunch()}>
            Reiniciar agora
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
