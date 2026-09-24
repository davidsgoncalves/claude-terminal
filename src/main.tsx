import ReactDOM from "react-dom/client";
import App from "./App";
import { useStore } from "./lib/store";
import { markPendingResume } from "./lib/restored";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { tabIdOfLabel } from "./lib/detach";
import { DetachedTerminal } from "./components/DetachedTerminal";

// State lives in a file, so it loads before the first render. Rendering first
// would let early writes persist an empty layout over the saved one.
const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const detachedTab = tabIdOfLabel(getCurrentWebviewWindow().label);
// A detached window only draws one terminal and never loads or saves state.
if (detachedTab) root.render(<DetachedTerminal tabId={detachedTab} />);
else useStore.persist
  .rehydrate()
  ?.catch((err: unknown) => console.error("state load failed", err))
  .finally(() => {
    markPendingResume(useStore.getState().tabs.map((t) => t.id));
    root.render(<App />);
  });
