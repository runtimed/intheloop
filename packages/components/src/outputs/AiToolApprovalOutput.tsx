import React from "react";
import { Button } from "../ui/button.js";
import { Card } from "../ui/card.js";
import {
  Shield,
  ShieldCheck,
  FilePlus,
  Edit,
  Play,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface AiToolApprovalOutputProps {
  toolCallId: string;
  toolName: string;
  onApprove: (status: "approved_once" | "approved_always" | "denied") => void;
}

interface ToolConfig {
  icon: React.ElementType;
  description: string;
}

const TOOL_CONFIGS: Record<string, ToolConfig> = {
  create_cell: {
    icon: FilePlus,
    description: "Create a new cell in the notebook",
  },
  modify_cell: {
    icon: Edit,
    description: "Modify the content of an existing cell",
  },
  execute_cell: {
    icon: Play,
    description: "Execute a code cell",
  },
  delete_cell: {
    icon: XCircle,
    description: "Delete a cell from the notebook",
  },
};

const formatToolName = (toolName: string): string => {
  // Handle MCP tools (mcp__server__toolname format)
  if (toolName.startsWith("mcp__")) {
    const parts = toolName.split("__");
    if (parts.length >= 3) {
      const serverName = parts[1];
      const toolNamePart = parts.slice(2).join("_");
      return `${toolNamePart
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")} (${serverName})`;
    }
  }

  // Convert snake_case to title case for regular tools
  return toolName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const getToolConfig = (toolName: string): ToolConfig => {
  if (toolName.startsWith("mcp__")) {
    return {
      icon: Shield,
      description: "Use an external tool via MCP server",
    };
  }

  return (
    TOOL_CONFIGS[toolName] || {
      icon: Shield,
      description: `Use the ${formatToolName(toolName)} tool`,
    }
  );
};

export const AiToolApprovalOutput: React.FC<AiToolApprovalOutputProps> = ({
  toolCallId: _toolCallId,
  toolName,
  onApprove,
}) => {
  const toolConfig = getToolConfig(toolName);
  const ToolIcon = toolConfig.icon;

  return (
    <div className="py-2">
      <Card className="border-0 bg-white shadow-md">
        {/* Header */}
        <div className="border-b px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
              <ToolIcon className="h-4 w-4 text-gray-600" />
            </div>
            <div className="flex-1">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                {formatToolName(toolName)}
              </h4>
              <p className="mt-0.5 text-xs text-gray-600">
                {toolConfig.description}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-3">
          <div className="flex gap-2">
            <Button
              onClick={() => onApprove("denied")}
              size="sm"
              variant="outline"
              className="flex-1 border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50"
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" />
              Deny
            </Button>

            <Button
              onClick={() => onApprove("approved_once")}
              size="sm"
              className="flex-1 bg-green-600 text-white hover:bg-green-700"
              autoFocus
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Approve Once
            </Button>

            <Button
              onClick={() => onApprove("approved_always")}
              size="sm"
              variant="outline"
              className="flex-1 border-blue-200 text-blue-700 hover:border-blue-300 hover:bg-blue-50"
            >
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              Always Allow
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AiToolApprovalOutput;
