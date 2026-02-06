import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import "@runtimed/components/styles.css";

import { OutputTypesDemoPage } from "@runtimed/components";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OutputTypesDemoPage />
  </StrictMode>
);
