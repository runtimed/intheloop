import type { OutputData, OutputType } from "@runtimed/schema";
import {
  SingleOutput,
  OutputsContainer,
  SuspenseSpinner,
} from "@runtimed/components";

// Jupyter notebook types
export interface JupyterOutput {
  output_type: "stream" | "execute_result" | "display_data" | "error";
  name?: string; // stdout, stderr for stream
  text?: string | string[];
  data?: Record<string, string | string[]>;
  metadata?: Record<string, unknown>;
  execution_count?: number | null;
  ename?: string;
  evalue?: string;
  traceback?: string[];
}

export interface JupyterCell {
  id: string;
  cell_type: "code" | "markdown" | "raw";
  source: string | string[];
  outputs?: JupyterOutput[];
  execution_count?: number | null;
}

export interface JupyterNotebook {
  cells: JupyterCell[];
  metadata?: Record<string, unknown>;
  nbformat?: number;
  nbformat_minor?: number;
}

// Helper to join source lines
function joinSource(source: string | string[]): string {
  return Array.isArray(source) ? source.join("") : source;
}

// Convert Jupyter output to OutputData format
function convertJupyterOutput(
  output: JupyterOutput,
  cellId: string,
  position: number
): OutputData | null {
  const baseOutput = {
    id: `${cellId}-output-${position}`,
    cellId,
    position,
    streamName: null,
    executionCount: null,
    displayId: null,
    artifactId: null,
    mimeType: null,
    metadata: null,
    representations: null,
    data: null,
  };

  switch (output.output_type) {
    case "stream": {
      const text = Array.isArray(output.text)
        ? output.text.join("")
        : output.text || "";
      return {
        ...baseOutput,
        outputType: "terminal" as OutputType,
        streamName: (output.name as "stdout" | "stderr") || "stdout",
        data: text,
      } as OutputData;
    }

    case "execute_result":
    case "display_data": {
      const outputData = output.data || {};
      const representations: Record<
        string,
        { type: "inline"; data: unknown }
      > = {};

      for (const [mimeType, content] of Object.entries(outputData)) {
        const data = Array.isArray(content) ? content.join("") : content;
        representations[mimeType] = { type: "inline", data };
      }

      // Get primary mime type
      const mimeTypes = Object.keys(representations);
      const primaryMimeType =
        mimeTypes.find((m) => m.startsWith("text/html")) ||
        mimeTypes.find((m) => m.startsWith("image/")) ||
        mimeTypes.find((m) => m === "application/json") ||
        mimeTypes.find((m) => m === "text/plain") ||
        mimeTypes[0];

      return {
        ...baseOutput,
        outputType:
          output.output_type === "execute_result"
            ? ("multimedia_result" as OutputType)
            : ("multimedia_display" as OutputType),
        executionCount: output.execution_count ?? null,
        mimeType: primaryMimeType || null,
        representations,
        data: representations["text/plain"]?.data?.toString() || null,
      } as OutputData;
    }

    case "error": {
      return {
        ...baseOutput,
        outputType: "error" as OutputType,
        data: JSON.stringify({
          ename: output.ename || "Error",
          evalue: output.evalue || "",
          traceback: output.traceback || [],
        }),
      } as OutputData;
    }

    default:
      return null;
  }
}

// Code cell component
function CodeCell({ cell }: { cell: JupyterCell }) {
  const source = joinSource(cell.source);
  const outputs = (cell.outputs || [])
    .map((output, i) => convertJupyterOutput(output, cell.id, i))
    .filter((o): o is OutputData => o !== null);

  return (
    <div className="cell code-cell border-l-2 border-blue-400 mb-4">
      {/* Execution count badge */}
      <div className="flex items-start gap-2">
        <div className="w-12 flex-shrink-0 text-right text-gray-500 text-sm py-2 pr-2">
          [{cell.execution_count ?? " "}]
        </div>
        <div className="flex-1 min-w-0">
          {/* Input */}
          <div className="bg-gray-50 border border-gray-200 rounded overflow-hidden">
            <pre className="p-3 text-sm overflow-x-auto">
              <code>{source}</code>
            </pre>
          </div>

          {/* Outputs */}
          {outputs.length > 0 && (
            <div className="mt-2 bg-white border border-gray-100 rounded">
              <SuspenseSpinner>
                <OutputsContainer>
                  {outputs.map((output) => (
                    <SingleOutput key={output.id} output={output} />
                  ))}
                </OutputsContainer>
              </SuspenseSpinner>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Markdown cell component
function MarkdownCell({ cell }: { cell: JupyterCell }) {
  const source = joinSource(cell.source);

  // For markdown cells, render the output using SingleOutput with markdown type
  const markdownOutput: OutputData = {
    id: `${cell.id}-markdown`,
    cellId: cell.id,
    outputType: "markdown",
    position: 0,
    streamName: null,
    executionCount: null,
    displayId: null,
    artifactId: null,
    mimeType: null,
    metadata: null,
    representations: null,
    data: source,
  };

  return (
    <div className="cell markdown-cell border-l-2 border-green-400 mb-4">
      <div className="flex items-start gap-2">
        <div className="w-12 flex-shrink-0" />
        <div className="flex-1 min-w-0 p-3">
          <SuspenseSpinner>
            <SingleOutput output={markdownOutput} />
          </SuspenseSpinner>
        </div>
      </div>
    </div>
  );
}

// Raw cell component
function RawCell({ cell }: { cell: JupyterCell }) {
  const source = joinSource(cell.source);

  return (
    <div className="cell raw-cell border-l-2 border-gray-400 mb-4">
      <div className="flex items-start gap-2">
        <div className="w-12 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <pre className="p-3 bg-gray-100 text-sm overflow-x-auto rounded">
            {source}
          </pre>
        </div>
      </div>
    </div>
  );
}

// Notebook renderer
export function NotebookRenderer({
  notebook,
}: {
  notebook: JupyterNotebook;
}) {
  return (
    <div className="notebook-preview p-4">
      {notebook.cells.map((cell, index) => {
        switch (cell.cell_type) {
          case "code":
            return <CodeCell key={cell.id || index} cell={cell} />;
          case "markdown":
            return <MarkdownCell key={cell.id || index} cell={cell} />;
          case "raw":
            return <RawCell key={cell.id || index} cell={cell} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
