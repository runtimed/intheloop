import React from "react";
import type { OutputData, OutputType } from "@runtimed/schema";
import { IframeOutput } from "./outputs/IframeOutput.js";
import { SingleOutput } from "./outputs/SingleOutput.js";
import { OutputsContainer } from "./outputs/OutputsContainer.js";
import { SuspenseSpinner } from "./outputs/SuspenseSpinner.js";

const createOutput = (
  id: string,
  outputType: OutputType,
  data: Partial<OutputData>
): OutputData => {
  return {
    id,
    cellId: "demo-cell",
    outputType,
    position: 0,
    streamName: null,
    executionCount: null,
    displayId: null,
    artifactId: null,
    mimeType: null,
    metadata: null,
    representations: null,
    data: null,
    ...data,
  } as OutputData;
};

export const OutputTypesDemoPage: React.FC<{ iframeUri: string }> = ({
  iframeUri,
}) => {
  // Terminal outputs
  const stdoutOutput: OutputData = createOutput("terminal-stdout", "terminal", {
    streamName: "stdout",
    data: "Hello, World!\nThis is stdout output with ANSI colors:\n\x1b[32mGreen text\x1b[0m\n\x1b[31mRed text\x1b[0m\n\x1b[1mBold text\x1b[0m",
    position: 1,
  });

  const stderrOutput: OutputData = createOutput("terminal-stderr", "terminal", {
    streamName: "stderr",
    data: "Warning: This is stderr output\n\x1b[33mYellow warning\x1b[0m",
    position: 2,
  });

  // Markdown output
  const markdownOutput: OutputData = createOutput("markdown-1", "markdown", {
    data: `# Markdown Output Demo

This is a **markdown** output with:

- Lists
- \`code\` blocks
- [Links](https://example.com)

\`\`\`python
def hello():
    print("Hello from markdown!")
\`\`\`

> Blockquote example`,
    position: 3,
  });

  // Error output
  const errorOutput: OutputData = createOutput("error-1", "error", {
    data: JSON.stringify({
      ename: "ValueError",
      evalue: "Invalid value provided",
      traceback: [
        "Traceback (most recent call last):",
        '  File "<stdin>", line 1, in <module>',
        "ValueError: Invalid value provided",
      ],
    }),
    position: 4,
  });

  // HTML output (using IframeOutput)
  const htmlOutput: OutputData = createOutput("html-1", "multimedia_display", {
    data: "<div>HTML Content</div>",
    mimeType: "text/html",
    representations: {
      "text/html": {
        type: "inline",
        data: `<div style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px;">
  <h2>HTML Output Demo</h2>
  <p>This is rendered HTML content with styling.</p>
  <ul>
    <li>Styled list item 1</li>
    <li>Styled list item 2</li>
  </ul>
</div>`,
      },
    },
    position: 5,
  });

  // SVG output (using IframeOutput)
  const svgOutput: OutputData = createOutput("svg-1", "multimedia_display", {
    data: "<svg>SVG Content</svg>",
    mimeType: "image/svg+xml",
    representations: {
      "image/svg+xml": {
        type: "inline",
        data: `<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:rgb(255,255,0);stop-opacity:1" />
      <stop offset="100%" style="stop-color:rgb(255,0,0);stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="400" height="200" fill="url(#grad1)" />
  <circle cx="200" cy="100" r="50" fill="white" opacity="0.8" />
  <text x="200" y="110" font-family="Arial" font-size="24" fill="black" text-anchor="middle">SVG Output</text>
</svg>`,
      },
    },
    position: 6,
  });

  // JSON output
  const jsonOutput: OutputData = createOutput("json-1", "multimedia_result", {
    data: '{"key": "value"}',
    mimeType: "application/json",
    representations: {
      "application/json": {
        type: "inline",
        data: {
          name: "Demo Data",
          items: [1, 2, 3, 4, 5],
          nested: {
            key: "value",
            number: 42,
          },
        },
      },
    },
    executionCount: 1,
    position: 7,
  });

  // GeoJSON output
  const geojsonOutput: OutputData = createOutput(
    "geojson-1",
    "multimedia_result",
    {
      data: '{"type":"FeatureCollection"}',
      mimeType: "application/geo+json",
      representations: {
        "application/geo+json": {
          type: "inline",
          data: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: [-122.4194, 37.7749],
                },
                properties: {
                  name: "San Francisco",
                  population: 873965,
                },
              },
              {
                type: "Feature",
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [-122.5, 37.7],
                      [-122.4, 37.7],
                      [-122.4, 37.8],
                      [-122.5, 37.8],
                      [-122.5, 37.7],
                    ],
                  ],
                },
                properties: {
                  name: "Sample Area",
                  area: "~77 km²",
                },
              },
            ],
          },
        },
      },
      executionCount: 2,
      position: 8,
    }
  );

  // Plain text output
  const plainTextOutput: OutputData = createOutput(
    "text-1",
    "multimedia_result",
    {
      data: "Plain text content",
      mimeType: "text/plain",
      representations: {
        "text/plain": {
          type: "inline",
          data: "This is plain text output.\nIt can span multiple lines.\n\nWith paragraphs too!",
        },
      },
      executionCount: 3,
      position: 9,
    }
  );

  // Image output (PNG - base64 data URL example)
  const imageOutput: OutputData = createOutput(
    "image-1",
    "multimedia_display",
    {
      data: "Image data",
      mimeType: "image/png",
      representations: {
        "image/png": {
          type: "inline",
          data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAnElEQVR42u3RAQ0AAAgDIE1u9FvDOahAVzLFGS1ECEKEIEQIQoQgRIgQIQgRghAhCBGCECEIQYgQhAhBiBCECEEIQoQgRAhChCBECEIQIgQhQhAiBCFCEIIQIQgRghAhCBGCEIQIQYgQhAhBiBCEIEQIQoQgRAhChCAEIUIQIgQhQhAiBCEIEYIQIQgRghAhCBEiRAhChCBECEK+W3uw+TnWoJc/AAAAAElFTkSuQmCC",
        },
        "text/plain": {
          type: "inline",
          data: "[Image: 1x1 pixel PNG]",
        },
      },
      position: 10,
    }
  );

  const allOutputs: Array<{
    name: string;
    type: string;
    outputs: OutputData[];
  }> = [
    {
      name: "Plain Text Output",
      type: "text",
      outputs: [plainTextOutput],
    },
    {
      name: "Terminal Output (stdout)",
      type: "terminal-stdout",
      outputs: [stdoutOutput],
    },
    {
      name: "Terminal Output (stderr)",
      type: "terminal-stderr",
      outputs: [stderrOutput],
    },
    {
      name: "Error Output",
      type: "error",
      outputs: [errorOutput],
    },
    {
      name: "Markdown Output",
      type: "markdown",
      outputs: [markdownOutput],
    },
    {
      name: "JSON Output",
      type: "json",
      outputs: [jsonOutput],
    },
    {
      name: "Image Output (PNG)",
      type: "image",
      outputs: [imageOutput],
    },
    {
      name: "SVG Output (Iframe)",
      type: "svg",
      outputs: [svgOutput],
    },
    {
      name: "HTML Output (Iframe)",
      type: "html",
      outputs: [htmlOutput],
    },
    {
      name: "GeoJSON Output",
      type: "geojson",
      outputs: [geojsonOutput],
    },
  ];

  return (
    <div className="container mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Cell Output Types Demo</h1>
      <p className="text-muted-foreground mb-8">
        This page demonstrates all the different cell output types supported by
        the system. HTML and SVG outputs are rendered using IframeOutput for
        sandboxed rendering.
      </p>

      <div className="space-y-4">
        {allOutputs.map((section) => {
          return (
            <div
              key={section.type}
              className="grid gap-4 border-t border-black last:border-b sm:grid-cols-2"
            >
              <div className="flex items-start">
                <h2 className="font-semibold">{section.name}</h2>
              </div>

              {/* Render HTML and SVG using IframeOutput */}
              <div className="py-3">
                {section.type === "html" || section.type === "svg" ? (
                  <div className="border border-dotted border-gray-300">
                    <IframeOutput
                      iframeUri={iframeUri ?? "."}
                      outputs={section.outputs}
                      className="min-h-[200px] w-full"
                      isReact={true}
                    />
                  </div>
                ) : (
                  <div className="border border-dotted border-gray-300">
                    <SuspenseSpinner>
                      <OutputsContainer>
                        {section.outputs.map((output) => (
                          <SingleOutput key={output.id} output={output} />
                        ))}
                      </OutputsContainer>
                    </SuspenseSpinner>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
