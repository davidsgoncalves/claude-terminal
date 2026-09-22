import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../lib/store";
import { Modal } from "./Modal";
import { AddFolder, FolderChoice } from "./FolderFields";
import { BORDER_OPTIONS } from "../lib/types";
import type { PathCheck } from "../lib/types";

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const {
    folders,
    removeFolder,
    renameFolder,
    defaultFolderId,
    setDefaultFolder,
    layout,
    setLayout,
    barPosition,
    setBarPosition,
    terminalBorder,
    setTerminalBorder,
  } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"aparencia" | "pastas">("aparencia");

  return (
    <Modal title="Configurações" onClose={onClose}>
      <nav className="modal-tabs">
        <button className={tab === "aparencia" ? "on" : ""} onClick={() => setTab("aparencia")}>
          Aparência
        </button>
        <button className={tab === "pastas" ? "on" : ""} onClick={() => setTab("pastas")}>
          Pastas
        </button>
      </nav>

      {tab === "aparencia" && (
      <>
      <section className="settings-section">
        <h3>Lista de sessões</h3>
        <div className="chip-row">
          <button className={`chip ${layout === "sidebar" ? "on" : ""}`} onClick={() => setLayout("sidebar")}>
            Lateral
          </button>
          <button className={`chip ${layout === "topbar" ? "on" : ""}`} onClick={() => setLayout("topbar")}>
            Superior
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Barra de limites</h3>
        <div className="chip-row">
          <button
            className={`chip ${barPosition === "top" ? "on" : ""}`}
            onClick={() => setBarPosition("top")}
          >
            No topo
          </button>
          <button
            className={`chip ${barPosition === "bottom" ? "on" : ""}`}
            onClick={() => setBarPosition("bottom")}
          >
            Embaixo
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Borda do terminal</h3>
        <div className="chip-row">
          {BORDER_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`chip ${terminalBorder === o.value ? "on" : ""}`}
              onClick={() => setTerminalBorder(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>
      </>
      )}

      {tab === "pastas" && (
      <>
      <section className="settings-section">
        <h3>Pasta base de abertura</h3>
        <p className="hint">Usada pelo grupo Sem grupo e como sugestão inicial dos demais.</p>
        <FolderChoice
          value={defaultFolderId}
          onChange={setDefaultFolder}
          allowNone
          noneLabel="Perguntar toda vez"
        />
      </section>

      <section className="settings-section">
        <h3>Pastas de trabalho</h3>
        <p className="hint">Toda sessão nova abre em uma destas pastas.</p>
        <AddFolder />
        <ul className="folder-manage">
          {folders.map((f) => (
            <li key={f.id}>
              {editing === f.id ? (
                <input
                  className="inline-edit"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => {
                    if (draft.trim()) renameFolder(f.id, draft.trim());
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <span
                  className="folder-name"
                  title="Duplo clique para renomear"
                  onDoubleClick={() => {
                    setDraft(f.name);
                    setEditing(f.id);
                  }}
                >
                  {f.name}
                </span>
              )}
              <span className="folder-path" title={f.path}>
                {f.path}
              </span>
              <button className="icon-btn" title="Remover" onClick={() => removeFolder(f.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>
      </>
      )}
    </Modal>
  );
}

function NewGroupDialog({ onClose }: { onClose: () => void }) {
  const { addGroup, folders } = useStore();
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);

  const create = () => {
    addGroup(name.trim() || undefined, folderId);
    onClose();
  };

  return (
    <Modal
      title="Novo grupo"
      onClose={onClose}
      footer={
        <>
          <button className="ghost auto" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" onClick={create}>
            Criar grupo
          </button>
        </>
      }
    >
      <label className="field">
        <span>Nome</span>
        <input
          autoFocus
          placeholder="Vakinha, API, estudos…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
      </label>
      <section className="settings-section">
        <h3>Pasta base (opcional)</h3>
        <p className="hint">Com pasta base, sessões novas do grupo abrem direto nela.</p>
        <FolderChoice value={folderId} onChange={setFolderId} allowNone noneLabel="Perguntar toda vez" />
        {folders.length === 0 && <AddFolder onAdded={setFolderId} />}
      </section>
    </Modal>
  );
}

function PickFolderDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { folders, addTab, setGroupFolder, groups } = useStore();
  const group = groups.find((g) => g.id === groupId);
  const [remember, setRemember] = useState(false);

  const openIn = (path: string, name: string, folderId?: string) => {
    if (remember && folderId) setGroupFolder(groupId, folderId);
    addTab(groupId, { cwd: path, title: name });
    onClose();
  };

  const browseOnce = async () => {
    const picked = await open({ directory: true, multiple: false, title: "Abrir sessão em" });
    if (typeof picked !== "string") return;
    const check = await invoke<PathCheck>("path_check", { path: picked });
    openIn(check.expanded, check.name ?? check.expanded);
  };

  const openHome = async () => {
    const home = await invoke<string>("home_dir");
    openIn(home, "~");
  };

  return (
    <Modal
      title={group ? `Nova sessão em ${group.name}` : "Nova sessão"}
      onClose={onClose}
      footer={
        <>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            usar como pasta base do grupo
          </label>
          <button className="ghost auto" onClick={() => void browseOnce()}>
            Outra pasta…
          </button>
          <button className="ghost auto" onClick={() => void openHome()}>
            Pasta pessoal
          </button>
        </>
      }
    >
      {folders.length === 0 ? (
        <>
          <p className="hint">Nenhuma pasta configurada. Adicione a primeira:</p>
          <AddFolder />
        </>
      ) : (
        <ul className="folder-choice pick">
          {folders.map((f) => (
            <li key={f.id} onClick={() => openIn(f.path, f.name, f.id)}>
              <span className="folder-name">{f.name}</span>
              <span className="folder-path" title={f.path}>
                {f.path}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export function Dialogs() {
  const { modal, openModal } = useStore();
  const close = () => openModal(null);
  if (!modal) return null;
  if (modal.kind === "settings") return <SettingsDialog onClose={close} />;
  if (modal.kind === "newGroup") return <NewGroupDialog onClose={close} />;
  return <PickFolderDialog groupId={modal.groupId} onClose={close} />;
}
