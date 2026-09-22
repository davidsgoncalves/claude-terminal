import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../lib/store";
import type { PathCheck } from "../lib/types";

/** Native folder picker plus manual entry, both validated before saving. */
export function AddFolder({ onAdded }: { onAdded?: (id: string) => void }) {
  const addFolder = useStore((s) => s.addFolder);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const check = await invoke<PathCheck>("path_check", { path: value });
    if (!check.exists) return setError("Pasta não encontrada.");
    if (!check.is_dir) return setError("Esse caminho não é uma pasta.");
    setError(null);
    setPath("");
    const id = addFolder(check.name ?? check.expanded, check.expanded);
    onAdded?.(id);
  };

  const browse = async () => {
    const picked = await open({ directory: true, multiple: false, title: "Escolher pasta" });
    if (typeof picked === "string") await save(picked);
  };

  return (
    <div className="add-folder">
      <div className="row">
        <input
          placeholder="/caminho/do/projeto ou ~/projects/app"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void save(path)}
        />
        <button className="ghost auto" onClick={() => void save(path)} disabled={!path.trim()}>
          Adicionar
        </button>
        <button className="ghost auto" onClick={() => void browse()}>
          Procurar…
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Radio-style folder list; `allowNone` adds an explicit "no folder" option. */
export function FolderChoice({
  value,
  onChange,
  allowNone,
  noneLabel = "Nenhuma",
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const folders = useStore((s) => s.folders);
  if (folders.length === 0) {
    return <p className="hint">Nenhuma pasta configurada ainda.</p>;
  }
  return (
    <ul className="folder-choice">
      {allowNone && (
        <li className={value === null ? "on" : ""} onClick={() => onChange(null)}>
          <span className="folder-name">{noneLabel}</span>
        </li>
      )}
      {folders.map((f) => (
        <li key={f.id} className={value === f.id ? "on" : ""} onClick={() => onChange(f.id)}>
          <span className="folder-name">{f.name}</span>
          <span className="folder-path" title={f.path}>
            {f.path}
          </span>
        </li>
      ))}
    </ul>
  );
}
