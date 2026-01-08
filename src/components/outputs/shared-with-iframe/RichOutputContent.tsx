import React from "react";

import {
  APPLICATION_MIME_TYPES,
  IMAGE_MIME_TYPES,
  TEXT_MIME_TYPES,
  AI_TOOL_CALL_MIME_TYPE,
  AI_TOOL_RESULT_MIME_TYPE,
  isAiToolCallData,
  isAiToolResultData,
} from "@runtimed/schema";

// Dynamic imports for heavy components
const MarkdownRenderer = React.lazy(() =>
  import("@/components/outputs/shared-with-iframe/MarkdownRenderer").then(
    (m) => ({
      default: m.MarkdownRenderer,
    })
  )
);
const JsonOutput = React.lazy(() =>
  import("@/components/outputs/shared-with-iframe/JsonOutput").then((m) => ({
    default: m.JsonOutput,
  }))
);
const HtmlOutput = React.lazy(() =>
  import("@/components/outputs/shared-with-iframe/HtmlOutput").then((m) => ({
    default: m.HtmlOutput,
  }))
);
const ImageOutput = React.lazy(() =>
  import("@/components/outputs/shared-with-iframe/ImageOutput").then((m) => ({
    default: m.ImageOutput,
  }))
);
const SvgOutput = React.lazy(() =>
  import("@/components/outputs/shared-with-iframe/SvgOutput").then((m) => ({
    default: m.SvgOutput,
  }))
);
const PlainTextOutput = React.lazy(() =>
  import("@/components/outputs/shared-with-iframe/PlainTextOutput").then(
    (m) => ({
      default: m.PlainTextOutput,
    })
  )
);
const GeoJsonMapOutput = React.lazy(() =>
  import(
    "@/components/outputs/shared-with-iframe/geojson/GeoJsonMapOutput"
  ).then((m) => ({
    default: m.GeoJsonMapOutput,
  }))
);

// Dynamic imports for AI outputs
const AiToolCallOutput = React.lazy(() =>
  import("@/components/outputs/shared-with-iframe/AiToolCallOutput").then(
    (m) => ({
      default: m.AiToolCallOutput,
    })
  )
);
const AiToolResultOutput = React.lazy(() =>
  import("@/components/outputs/shared-with-iframe/AiToolResultOutput").then(
    (m) => ({
      default: m.AiToolResultOutput,
    })
  )
);

export function RichOutputContent({
  mediaType,
  outputData,
}: {
  mediaType: string;
  outputData: Record<string, unknown>;
}) {
  switch (mediaType) {
    case AI_TOOL_CALL_MIME_TYPE: {
      const toolData = outputData[mediaType];
      if (isAiToolCallData(toolData)) {
        return <AiToolCallOutput toolData={toolData} />;
      }
      return <div className="text-red-500">Invalid tool call data</div>;
    }

    case AI_TOOL_RESULT_MIME_TYPE: {
      const resultData = outputData[mediaType];
      if (isAiToolResultData(resultData)) {
        return <AiToolResultOutput resultData={resultData} />;
      }
      return <div className="text-red-500">Invalid tool result data</div>;
    }

    case TEXT_MIME_TYPES[2]: // text/markdown
      return (
        <MarkdownRenderer
          content={String(outputData[mediaType] || "")}
          enableCopyCode={true}
        />
      );

    case TEXT_MIME_TYPES[1]: // text/html
      return <HtmlOutput content={String(outputData[mediaType] || "")} />;

    case IMAGE_MIME_TYPES[0]: // image/png
    case IMAGE_MIME_TYPES[1]: // image/jpeg
      return (
        <ImageOutput
          src={String(outputData[mediaType] || "")}
          mediaType={mediaType as "image/png" | "image/jpeg"}
        />
      );

    case IMAGE_MIME_TYPES[2]: // image/svg+xml
    case "image/svg": // legacy SVG format
      return <SvgOutput content={String(outputData[mediaType] || "")} />;

    case "application/vnd.plotly.v1+json":
      return <JsonOutput data={outputData[mediaType]} />;

    case "application/vnd.vegalite.v2+json":
    case "application/vnd.vegalite.v3+json":
    case "application/vnd.vegalite.v4+json":
    case "application/vnd.vegalite.v5+json":
    case "application/vnd.vegalite.v6+json":
    case "application/vnd.vega.v3+json":
    case "application/vnd.vega.v4+json":
    case "application/vnd.vega.v5+json":
      return <JsonOutput data={outputData[mediaType]} />;

    case "application/geo+json":
      return <GeoJsonMapOutput data={outputData[mediaType]} />;

    case APPLICATION_MIME_TYPES[0]: // application/json
      return <JsonOutput data={outputData[mediaType]} />;

    case TEXT_MIME_TYPES[0]: // text/plain
    default:
      return <PlainTextOutput content={String(outputData[mediaType] || "")} />;
  }
}
