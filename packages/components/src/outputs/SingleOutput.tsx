import React from "react";

import { AnsiErrorOutput, AnsiStreamOutput } from "./AnsiOutput.js";
import {
  AI_TOOL_CALL_MIME_TYPE,
  AI_TOOL_RESULT_MIME_TYPE,
  APPLICATION_MIME_TYPES,
  IMAGE_MIME_TYPES,
  JUPYTER_MIME_TYPES,
  TEXT_MIME_TYPES,
  isArtifactContainer,
  isInlineContainer,
} from "@runtimed/schema";
import type { MediaContainer, OutputData } from "@runtimed/schema";
import PlainTextOutput from "./PlainTextOutput.js";
import { RichOutputContent } from "./RichOutputContent.js";

// Dynamic imports for heavy components
const MarkdownRenderer = React.lazy(() =>
  import("./MarkdownRenderer.js").then((m) => ({
    default: m.MarkdownRenderer,
  }))
);

/**
 * Process multimedia data and convert it to a format suitable for rendering
 */
const processMultimediaData = (data: Record<string, MediaContainer>) => {
  // Check if data contains media containers (new format)
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const potentialContainers = data as Record<string, MediaContainer>;

    // Check if this looks like media containers
    const hasContainers = Object.values(potentialContainers).some(
      (value: any) => isInlineContainer(value) || isArtifactContainer(value)
    );

    if (hasContainers) {
      // Convert from media containers to rendering format
      const outputData: Record<string, unknown> = {};
      for (const [mimeType, container] of Object.entries(potentialContainers)) {
        if (isInlineContainer(container)) {
          outputData[mimeType] = container.data;
        } else if (isArtifactContainer(container)) {
          // For artifact containers, we need to determine the URL
          // Since we don't have access to ArtifactClient here, we check metadata for fileUrl
          // If Projects artifacts are enabled (fileUrl present), use it; otherwise use legacy endpoint
          const metadataFileUrl =
            typeof container.metadata?.fileUrl === "string"
              ? container.metadata.fileUrl
              : undefined;
          const fileUrl =
            metadataFileUrl || `/api/artifacts/${container.artifactId}`;

          outputData[mimeType] = fileUrl;
        }
      }
      return outputData;
    } else {
      // Direct data format (legacy support)
      return potentialContainers;
    }
  } else {
    // Fallback for simple data
    return { "text/plain": String(data || "") };
  }
};

// Determine the best media type to render, in order of preference
const getPreferredMediaType = (
  outputData: Record<string, unknown>
): string | null => {
  const preferenceOrder = [
    AI_TOOL_CALL_MIME_TYPE,
    AI_TOOL_RESULT_MIME_TYPE,
    // Jupyter rich formats (plots, widgets, etc.)
    ...JUPYTER_MIME_TYPES,
    // Text formats
    TEXT_MIME_TYPES[2], // text/markdown
    TEXT_MIME_TYPES[1], // text/html
    // Images
    IMAGE_MIME_TYPES[0], // image/png
    IMAGE_MIME_TYPES[1], // image/jpeg
    IMAGE_MIME_TYPES[2], // image/svg+xml
    "image/svg", // legacy SVG format
    // Application formats
    APPLICATION_MIME_TYPES[0], // application/json
    TEXT_MIME_TYPES[0], // text/plain
  ];

  for (const mediaType of preferenceOrder) {
    if (outputData[mediaType] !== undefined && outputData[mediaType] !== null) {
      return mediaType;
    }
  }

  return null;
};

function ErrorOutput({ data }: { data: string | null }) {
  let errorData;
  try {
    errorData = typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    errorData = { ename: "Error", evalue: String(data), traceback: [] };
  }
  return (
    <AnsiErrorOutput
      ename={errorData.ename}
      evalue={errorData.evalue}
      traceback={errorData.traceback}
    />
  );
}

export const SingleOutput: React.FC<{
  output: OutputData & {
    outputType:
      | "multimedia_display"
      | "multimedia_result"
      | "terminal"
      | "markdown"
      | "error";
  };
}> = ({ output }) => {
  const { data, outputType } = output;

  // Handle terminal outputs specially
  switch (outputType) {
    case "terminal": {
      const textData = typeof data === "string" ? data : String(data || "");
      // TODO: can we update the schema type if this state is impossible?
      if (output.streamName !== "stdout" && output.streamName !== "stderr") {
        throw new Error(
          `Terminal output has unexpected streamName: ${output.streamName}`
        );
      }
      return (
        <AnsiStreamOutput text={textData} streamName={output.streamName} />
      );
    }
    // Handle markdown outputs specially with delta support
    case "markdown": {
      return (
        <MarkdownRenderer content={String(data || "")} enableCopyCode={true} />
      );
    }
    // Handle error outputs specially
    case "error": {
      return <ErrorOutput data={data} />;
    }
  }

  // Fallback just in case, should never happen
  if (!output.representations) {
    return <PlainTextOutput content={String(data || "")} />;
  }

  // IPython outputs are plain text
  // Handle multimedia outputs (multimedia_display, multimedia_result)
  const outputData = processMultimediaData(output.representations);
  const mediaType = getPreferredMediaType(outputData);

  if (!mediaType) {
    return (
      <div className="bg-gray-50/50 p-3 text-sm text-gray-500 italic">
        No displayable content
      </div>
    );
  }

  // outputType is now always "multimedia_display" or "multimedia_result"

  return (
    <div className="rich-output">
      <div className="max-w-full overflow-hidden">
        <RichOutputContent mediaType={mediaType} outputData={outputData} />
      </div>
    </div>
  );
};
