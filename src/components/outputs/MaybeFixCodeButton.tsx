import { useAddCell } from "@/hooks/useAddCell";
import { OutputData } from "@runtimed/schema";
import { Bug } from "lucide-react";
import { useCallback } from "react";
import { Button } from "../ui/button";
import { OutputsContainer } from "@runtimed/components";

export function MaybeFixCodeButton({
  isLoading,
  cellId,
  outputs,
}: {
  isLoading: boolean;
  cellId: string;
  outputs: readonly OutputData[];
}) {
  const errorOutput = outputs.find((output) => output.outputType === "error");

  if (
    !errorOutput ||
    !errorOutput.data ||
    typeof errorOutput.data !== "string"
  ) {
    return null;
  }

  return (
    <OutputsContainer>
      <FixCodeButton
        cellId={cellId}
        errorOutputData={errorOutput.data}
        isLoading={isLoading}
      />
    </OutputsContainer>
  );
}

const FixCodeButton = ({
  cellId,
  errorOutputData,
  isLoading,
}: {
  cellId: string;
  errorOutputData: string;
  isLoading: boolean;
}) => {
  const { addCell } = useAddCell();

  const handleFixCode = useCallback(() => {
    const formattedErrorOutputData = formatErrorOutputData(errorOutputData);
    const message = formatAiMessage(formattedErrorOutputData);
    addCell(cellId, "ai", "after", message);
  }, [addCell, cellId, errorOutputData]);

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleFixCode}
      disabled={isLoading}
    >
      <Bug /> Fix Code with AI{" "}
    </Button>
  );
};

/** Add code block to the error message */
function formatAiMessage(errorString: string) {
  return `Fix the error:\n \`\`\`json\n${errorString}\n\`\`\`\n`;
}

/** Formats the error for AI model to fix */
function formatErrorOutputData(errorOutputData: string) {
  return JSON.stringify(JSON.parse(errorOutputData), null, 2);
}
