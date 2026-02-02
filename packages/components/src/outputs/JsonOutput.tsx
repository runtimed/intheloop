import React from "react";
import JsonView from "@uiw/react-json-view";

interface JsonOutputProps {
  data: unknown;
  compact?: boolean;
}

export const JsonOutput: React.FC<JsonOutputProps> = ({
  data,
  compact = false,
}) => {
  const jsonData = data && typeof data === "object" ? data : { value: data };

  return (
    <div className="rounded bg-gray-50/50 p-2">
      <JsonView
        value={jsonData}
        collapsed={compact ? 1 : false}
        displayDataTypes={false}
        indentWidth={2}
        style={{
          backgroundColor: "transparent",
          fontSize: "0.875rem",
        }}
      />
    </div>
  );
};

export default JsonOutput;
