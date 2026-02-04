import { useState, useEffect } from "react";
import { Button, OutputTypesDemoPage, JsonOutput } from "@runtimed/components";

export function App() {
  const [count, setCount] = useState(0);
  const [notebookData, setNotebookData] = useState<unknown>(null);

  useEffect(() => {
    // Accept messages from any origin
    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data?.count === "number") {
        setCount(event.data.count);
      }
      if (event.data?.json !== undefined) {
        const json =
          typeof event.data.json === "string"
            ? JSON.parse(event.data.json)
            : event.data.json;
        setNotebookData(json);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <>
      <Button onClick={() => setCount((c) => c + 1)}>Count is {count}</Button>
      {notebookData && <JsonOutput data={notebookData} />}
      <OutputTypesDemoPage />
    </>
  );
}
