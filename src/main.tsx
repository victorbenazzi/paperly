import React from "react";
import ReactDOM from "react-dom/client";

// Order matters: CSS first, then i18n + theme (module-load side effects,
// both must run before the first paint to avoid language/theme flashes).
import "./index.css";
import "@/features/i18n/config";
import { initThemeListener } from "@/features/theme/theme.store";

import App from "./App";

initThemeListener();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
