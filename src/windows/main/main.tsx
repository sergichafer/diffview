import "@fontsource-variable/inter/opsz.css";
import "@fontsource/syne/600.css";
import "@/design/theme/pierre/register-themes";
import React from "react";
import ReactDOM from "react-dom/client";
import { Editor, type EditorOptions } from "@pierre/diffs/edit";
import {
  EditProvider,
  WorkerPoolContextProvider,
} from "@pierre/diffs/react";
import App from "./App";
import {
  diffsHighlighterOptions,
  diffsWorkerPoolOptions,
} from "@/shared/tauri/diffsWorker";

function createEditor(options: EditorOptions<undefined>) {
  // persistState also writes CodeView viewport scrollTop into editor view
  // state and restores it (or 0) on the next attach, which yanks the list
  // back to the previous file. Document persistence is the hydration cache.
  return new Editor(options);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <WorkerPoolContextProvider
      poolOptions={diffsWorkerPoolOptions}
      highlighterOptions={diffsHighlighterOptions}
    >
      <EditProvider createEditor={createEditor}>
        <App />
      </EditProvider>
    </WorkerPoolContextProvider>
  </React.StrictMode>,
);
