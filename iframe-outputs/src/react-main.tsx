import { createRoot } from "react-dom/client";
import { IframeReactApp, sendFromIframe } from "@runtimed/components";
import "./style.css";

// Main React initialization for iframe outputs
function initializeReactIframe() {
  const container = document.getElementById("react-root");
  if (!container) {
    console.error("React root element not found");
    return;
  }

  const root = createRoot(container);
  root.render(<IframeReactApp />);

  // Send iframe loaded message
  sendFromIframe({ type: "iframe-loaded" });
}

document.addEventListener("dblclick", () => {
  sendFromIframe({ type: "iframe-double-click" });
});

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeReactIframe);
} else {
  initializeReactIframe();
}
