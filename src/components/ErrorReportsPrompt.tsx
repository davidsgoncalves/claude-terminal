import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../lib/store";
import type { ReportsState } from "../lib/errors";

/** Asks once whether errors may be sent, in builds that can send them. */
export function ErrorReportsPrompt() {
  const { errorReportsAsked, setErrorReportsAsked } = useStore();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (errorReportsAsked) return;
    void invoke<ReportsState>("error_reports_get")
      .then((s) => setAvailable(s.available && !s.enabled))
      .catch(() => {});
  }, [errorReportsAsked]);

  if (errorReportsAsked || !available) return null;

  const answer = (enabled: boolean) => {
    setErrorReportsAsked(true);
    void invoke("error_reports_set", { enabled }).catch(() => {});
  };

  return (
    <div className="update-bar found">
      <span>
        Enviar relatórios de erro para ajudar a corrigir o Shellhive? Nada do que você digita ou vê no terminal é
        enviado.
      </span>
      <button className="primary" onClick={() => answer(true)}>
        Enviar
      </button>
      <button className="ghost auto" onClick={() => answer(false)}>
        Agora não
      </button>
    </div>
  );
}
