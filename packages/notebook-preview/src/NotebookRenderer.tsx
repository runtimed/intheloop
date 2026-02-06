import type { OutputData, OutputType } from "@runtimed/schema";
import {
  SingleOutput,
  OutputsContainer,
  SuspenseSpinner,
  ExecutionCount,
  SyntaxHighlighter,
  ErrorBoundary,
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
      const representations: Record<string, { type: "inline"; data: unknown }> =
        {};

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

// Extract language from notebook metadata
function getNotebookLanguage(metadata?: Record<string, unknown>): string {
  // Try kernelspec name first (e.g., "python3", "ir", "julia")
  const kernelspec = metadata?.kernelspec as
    | { language?: string; name?: string }
    | undefined;
  if (kernelspec?.language) {
    return kernelspec.language;
  }
  // Try language_info (more detailed)
  const languageInfo = metadata?.language_info as { name?: string } | undefined;
  if (languageInfo?.name) {
    return languageInfo.name;
  }
  // Default to python
  return "python";
}

// Code cell component
function CodeCell({ cell, language }: { cell: JupyterCell; language: string }) {
  const source = joinSource(cell.source);
  const outputs = (cell.outputs || [])
    .map((output, i) => convertJupyterOutput(output, cell.id, i))
    .filter((o): o is OutputData => o !== null);

  return (
    <div className="cell code-cell mb-4">
      {/* Execution count badge */}
      <div className="flex items-start gap-2">
        <div className="w-12 flex-shrink-0 text-right">
          <ExecutionCount count={cell.execution_count ?? null} />
        </div>
        <div className="min-w-0 flex-1">
          {/* Input */}
          <div className="overflow-hidden rounded border border-gray-200">
            <ErrorBoundary
              fallback={<div>Error rendering syntax highlighter</div>}
            >
              <SyntaxHighlighter
                language={language}
                enableCopy={true}
                customStyle={{ fontSize: "0.8rem" }}
              >
                {source}
              </SyntaxHighlighter>
            </ErrorBoundary>
          </div>

          {/* Outputs */}
          {outputs.length > 0 && (
            <div className="mt-2 rounded border border-gray-100 bg-white">
              <ErrorBoundary fallback={<div>Error rendering outputs</div>}>
                <SuspenseSpinner>
                  <OutputsContainer>
                    {outputs.map((output) => (
                      <SingleOutput key={output.id} output={output} />
                    ))}
                  </OutputsContainer>
                </SuspenseSpinner>
              </ErrorBoundary>
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
    <div className="cell markdown-cell mb-4">
      <div className="flex items-start gap-2">
        <div className="w-12 flex-shrink-0" />
        <div className="min-w-0 flex-1 p-3">
          <ErrorBoundary fallback={<div>Error rendering markdown</div>}>
            <SuspenseSpinner>
              <SingleOutput output={markdownOutput} />
            </SuspenseSpinner>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

// Raw cell component
function RawCell({ cell }: { cell: JupyterCell }) {
  const source = joinSource(cell.source);

  return (
    <div className="cell raw-cell mb-4">
      <div className="flex items-start gap-2">
        <div className="w-12 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <pre className="overflow-x-auto rounded bg-gray-100 p-3 text-sm">
            {source}
          </pre>
        </div>
      </div>
    </div>
  );
}

// Notebook renderer
export function NotebookRenderer({ notebook }: { notebook: JupyterNotebook }) {
  const language = getNotebookLanguage(notebook.metadata);

  return (
    <div className="notebook-preview py-4 pr-4 pl-2">
      <ErrorBoundary fallback={<div>Error rendering notebook</div>}>
        {notebook.cells.map((cell, index) => {
          switch (cell.cell_type) {
            case "code":
              return (
                <CodeCell
                  key={cell.id || index}
                  cell={cell}
                  language={language}
                />
              );
            case "markdown":
              return <MarkdownCell key={cell.id || index} cell={cell} />;
            case "raw":
              return <RawCell key={cell.id || index} cell={cell} />;
            default:
              return null;
          }
        })}
      </ErrorBoundary>
    </div>
  );
}
