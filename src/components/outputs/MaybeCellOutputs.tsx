import { cn } from "@/lib/utils";
import { outputsDeltasQuery, processDeltas } from "@/queries/outputDeltas";
import { CellType, OutputData, SAFE_MIME_TYPES } from "@runtimed/schema";
import { groupConsecutiveStreamOutputs } from "@/util/output-grouping";
import { useQuery } from "@livestore/react";
import { useMemo } from "react";
import { SingleOutput } from "./shared-with-iframe/SingleOutput";
import { OutputsContainer } from "./shared-with-iframe/OutputsContainer";
import { SuspenseSpinner } from "./shared-with-iframe/SuspenseSpinner";
import { MaybeFixCodeButton } from "./MaybeFixCodeButton";
import { IframeOutput } from "./IframeOutput";

/**
 * TODO: consider renaming this component
 * By default, we want to be ready to render the outputs
 */
export const MaybeCellOutputs = ({
  cellId,
  cellType,
  outputs,
  shouldAlwaysUseIframe = false,
  isLoading,
  showOutput,
}: {
  cellId: string;
  cellType: CellType;
  outputs: readonly OutputData[];
  shouldAlwaysUseIframe?: boolean;
  isLoading: boolean;
  showOutput: boolean;
}) => {
  const outputDeltas = useQuery(
    outputsDeltasQuery(outputs.map((output) => output.id))
  );

  // Apply grouping strategy based on cell type
  const processedOutputs = useMemo(() => {
    const grouped = groupConsecutiveStreamOutputs(outputs);
    return processDeltas(grouped, outputDeltas);
  }, [outputs, outputDeltas]);

  const isUnsafe = hasUnsafeOutputs(processedOutputs ?? []);

  // Always assume we'll be rendering in an iframe if there are no outputs
  const shouldUseIframe = shouldAlwaysUseIframe || isUnsafe || !outputs.length;

  return (
    <div
      className={cn(
        "cell-content bg-background max-w-full min-w-0 overflow-x-auto px-2 sm:px-4",
        showOutput ? "block" : "hidden"
      )}
    >
      {/* When loading and has stale outputs, we fade it out */}
      <div
        className={cn(
          outputs.length ? "transition-opacity duration-300" : "",
          isLoading && outputs.length ? "opacity-50" : "opacity-100"
        )}
      >
        {cellType === "code" && (
          <MaybeFixCodeButton
            isLoading={isLoading}
            cellId={cellId}
            outputs={outputs}
          />
        )}
        {/* TODO: consider rendering an empty iframewhen we have a safe output currently rendered but cell input has changed */}
        {shouldUseIframe ? (
          <IframeOutput
            outputs={processedOutputs}
            className="transition-[height] duration-150 ease-out"
            isReact
            cellType={cellType}
          />
        ) : (
          <SuspenseSpinner>
            <OutputsContainer>
              {processedOutputs.map((output: OutputData) => (
                <SingleOutput key={output.id} output={output} />
              ))}
            </OutputsContainer>
          </SuspenseSpinner>
        )}
      </div>
    </div>
  );
};

const hasUnsafeOutputs = (outputs: OutputData[]) => {
  return outputs.some((output) => {
    return !SAFE_MIME_TYPES.includes(output.mimeType as any);
  });
};
