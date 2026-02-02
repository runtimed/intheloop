import React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ChevronDown, Edit, FilePlus, Info } from "lucide-react";
import type { AiToolCallData } from "@runtimed/schema";

interface AiToolCallOutputProps {
  toolData: AiToolCallData;
}

// Tool icon and action mapping for AI tools
const getToolConfig = (toolName: string, status: string) => {
  const toolConfigs: Record<
    string,
    {
      icon: React.ComponentType<any>;
      verb: string;
      pastVerb: string;
      label: string;
    }
  > = {
    create_cell: {
      icon: FilePlus,
      verb: "Creating",
      pastVerb: "Created",
      label: "cell",
    },
    modify_cell: {
      icon: Edit,
      verb: "Modifying",
      pastVerb: "Modified",
      label: "cell",
    },
  };

  const config = toolConfigs[toolName] || {
    icon: Info,
    verb: "Executing",
    pastVerb: "Executed",
    label: "tool",
  };

  return {
    ...config,
    displayVerb: status === "success" ? config.pastVerb : config.verb,
  };
};

export const AiToolCallOutput: React.FC<AiToolCallOutputProps> = ({
  toolData,
}) => {
  // AiToolCallData doesn't have status, so we'll assume success for tool calls
  const isSuccess = true;
  const toolConfig = getToolConfig(toolData.tool_name, "success");
  const ToolIcon = toolConfig.icon;

  return (
    <div className="py-2">
      {Object.keys(toolData.arguments).length > 0 ? (
        <details className="group">
          <summary className="hover:bg-muted/20 -m-1 flex cursor-pointer items-center gap-2 rounded p-1 text-sm">
            <ToolIcon
              className={`h-4 w-4 ${
                isSuccess ? "text-green-500" : "text-red-500"
              }`}
            />
            <span className="text-muted-foreground flex-1">
              {toolConfig.displayVerb} {toolConfig.label}
            </span>
            <ChevronDown className="text-muted-foreground h-3 w-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="bg-card/30 border-border/50 mt-2 ml-6 rounded border p-3 text-xs">
            <div className="text-muted-foreground mb-2">
              Tool Call ID: {toolData.tool_call_id}
            </div>
            <SyntaxHighlighter
              language="json"
              style={oneLight}
              customStyle={{
                margin: 0,
                background: "transparent",
                fontSize: "0.75rem",
              }}
            >
              {JSON.stringify(toolData.arguments, null, 2)}
            </SyntaxHighlighter>
          </div>
        </details>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <ToolIcon
            className={`h-4 w-4 ${
              isSuccess ? "text-green-500" : "text-red-500"
            }`}
          />
          <span className="text-muted-foreground">
            {toolConfig.displayVerb} {toolConfig.label}
          </span>
          <span className="text-muted-foreground text-xs">
            ({toolData.tool_call_id})
          </span>
        </div>
      )}
    </div>
  );
};

export default AiToolCallOutput;
