import ReactDOM from "react-dom/client";
import App from "./App";
import { useStore } from "./lib/store";
import { markPendingResume } from "./lib/restored";

// State lives in a file, so it loads before the first render. Rendering first
// would let early writes persist an empty layout over the saved one.
const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
useStore.persist
  .rehydrate()
  ?.catch((err: unknown) => console.error("state load failed", err))
  .finally(() => {
    markPendingResume(useStore.getState().tabs.map((t) => t.id));
    root.render(<App />);
  });
