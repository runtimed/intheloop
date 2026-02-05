import { useState, useEffect } from "react";
import { NotebookRenderer, type JupyterNotebook } from "./NotebookRenderer";

export function App() {
  const [notebookData, setNotebookData] = useState<JupyterNotebook | null>(
    null
  );

  useEffect(() => {
    // Notify parent that iframe is ready
    window.parent.postMessage({ type: "iframe-loaded" }, "*");

    // Accept messages from any origin
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.json !== undefined) {
        const json =
          typeof event.data.json === "string"
            ? JSON.parse(event.data.json)
            : event.data.json;
        setNotebookData(json as JupyterNotebook);
        // Scroll to top when new notebook data arrives
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!notebookData) {
    return (
      <div className="p-4 text-center text-gray-500">
        Waiting for notebook data...
      </div>
    );
  }

  return <NotebookRenderer notebook={notebookData} />;
}
