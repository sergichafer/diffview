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
import { DesignReview } from "./DesignReview";
import {
  diffsHighlighterOptions,
  diffsWorkerPoolOptions,
} from "@/shared/tauri/diffsWorker";

function createEditor(options: EditorOptions<undefined>) {
  return new Editor(options);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <WorkerPoolContextProvider
      poolOptions={diffsWorkerPoolOptions}
      highlighterOptions={diffsHighlighterOptions}
    >
      <EditProvider createEditor={createEditor}>
        <DesignReview />
      </EditProvider>
    </WorkerPoolContextProvider>
  </React.StrictMode>,
);
