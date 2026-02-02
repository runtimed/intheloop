import { useState, useEffect } from "react";
import { Button, OutputTypesDemoPage } from "@runtimed/components";

export function App() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Accept messages from any origin
    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data?.count === "number") {
        setCount(event.data.count);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <>
      <Button onClick={() => setCount((c) => c + 1)}>Count is {count}</Button>
      <OutputTypesDemoPage />
    </>
  );
}
