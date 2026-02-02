import React from "react";
import { CheckCircle, XCircle, Clock, Info } from "lucide-react";
import type { AiToolResultData } from "@runtimed/schema";

interface AiToolResultOutputProps {
  resultData: AiToolResultData;
}

// Tool icon and message mapping for AI tool results
const getToolResultConfig = (status: string) => {
  switch (status) {
    case "success":
      return {
        icon: CheckCircle,
        color: "text-green-600",
        label: "Success",
      };
    case "error":
      return {
        icon: XCircle,
        color: "text-red-600",
        label: "Error",
      };
    case "pending":
      return {
        icon: Clock,
        color: "text-yellow-600",
        label: "Pending",
      };
    default:
      return {
        icon: Info,
        color: "text-blue-600",
        label: "Info",
      };
  }
};

export const AiToolResultOutput: React.FC<AiToolResultOutputProps> = ({
  resultData,
}) => {
  const config = getToolResultConfig(resultData.status);
  const ResultIcon = config.icon;

  return (
    <div className="flex items-start gap-2 py-1">
      <ResultIcon className={`h-4 w-4 ${config.color} mt-0.5 flex-shrink-0`} />
      {resultData.result && (
        <div className="text-foreground text-sm whitespace-pre-wrap">
          {resultData.result}
        </div>
      )}
    </div>
  );
};

export default AiToolResultOutput;
