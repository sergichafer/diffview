import "@fontsource-variable/inter/opsz.css";
import "@fontsource/jetbrains-mono/400.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { DesignReview } from "./DesignReview";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DesignReview />
  </React.StrictMode>,
);
