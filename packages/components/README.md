# @runtimed/components

React components for rendering notebook cell outputs. This package provides a comprehensive set of output renderers for displaying code execution results, including rich multimedia formats, terminal output, AI tool interactions, and geographic data.

## Installation

```bash
pnpm add @runtimed/components
# or
npm install @runtimed/components
```

**Peer Dependencies**: React 19+

## Quick Start

```tsx
import { SingleOutput, OutputsContainer } from "@runtimed/components";
import "@runtimed/components/styles.css";

function NotebookOutputs({ outputs }) {
  return (
    <OutputsContainer>
      {outputs.map((output) => (
        <SingleOutput key={output.id} output={output} />
      ))}
    </OutputsContainer>
  );
}
```

## Components

### Output Renderers

| Component           | Description                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| `SingleOutput`      | Smart router that selects the appropriate renderer based on output type |
| `OutputsContainer`  | Wrapper for consistent output styling                                   |
| `RichOutputContent` | Renders multimedia content by MIME type                                 |

### Specific Renderers

| Component          | MIME Types                                             |
| ------------------ | ------------------------------------------------------ |
| `PlainTextOutput`  | `text/plain`                                           |
| `MarkdownRenderer` | `text/markdown` - GFM, KaTeX math, syntax highlighting |
| `HtmlOutput`       | `text/html`                                            |
| `JsonOutput`       | `application/json` - interactive tree view             |
| `ImageOutput`      | `image/png`, `image/jpeg`, `image/gif`, `image/webp`   |
| `SvgOutput`        | `image/svg+xml`                                        |
| `AnsiOutput`       | Terminal output with ANSI color codes                  |
| `GeoJsonMapOutput` | `application/geo+json` - MapLibre-powered maps         |

### AI Tool Components

| Component              | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `AiToolCallOutput`     | Displays AI tool invocation details         |
| `AiToolResultOutput`   | Renders tool execution results              |
| `AiToolApprovalOutput` | UI for human-in-the-loop approval workflows |

### Iframe Integration

For sandboxed output rendering:

```tsx
import { IframeReactApp, IframeOutput } from "@runtimed/components";

// Parent: embed outputs in an iframe
<IframeOutput outputs={cellOutputs} />

// Child iframe: render the app
<IframeReactApp />
```

Communication utilities:

```tsx
import {
  useIframeCommsParent,
  useIframeCommsChild,
  sendToIframe,
  sendFromIframe,
} from "@runtimed/components";
```

### UI Components

Basic UI building blocks:

```tsx
import { Button, Card, Spinner } from "@runtimed/components";

<Button variant="outline" size="sm">Click me</Button>
<Spinner size="md" />
```

## Utilities

```tsx
import { cn, groupConsecutiveStreamOutputs } from "@runtimed/components";

// Merge Tailwind classes
cn("px-2 py-1", condition && "bg-blue-500");

// Group stdout/stderr streams for cleaner display
const grouped = groupConsecutiveStreamOutputs(outputs);
```

## Styling

Import the CSS for proper styling:

```tsx
import "@runtimed/components/styles.css";
```

The package uses Tailwind CSS v4. Components are designed to work in both light and dark themes.

## Features

- **Lazy loading**: Heavy components like `MarkdownRenderer` are dynamically imported
- **Error boundaries**: Outputs gracefully handle rendering failures
- **Artifact support**: Handles both inline data and artifact URLs for large outputs
- **Suspense-ready**: Built-in loading states with `SuspenseSpinner`

## Output Data Format

Components expect outputs conforming to `@runtimed/schema` types:

```typescript
import type { OutputData, OutputType } from "@runtimed/components";

interface OutputData {
  id: string;
  outputType:
    | "multimedia_display"
    | "multimedia_result"
    | "terminal"
    | "markdown"
    | "error";
  data?: string | null;
  representations?: Record<string, MediaContainer>;
  streamName?: "stdout" | "stderr";
}
```

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Type check
pnpm type-check

# Lint
pnpm lint
```

## Demo

The package includes a demo page for testing all output types:

```tsx
import { OutputTypesDemoPage } from "@runtimed/components";

<OutputTypesDemoPage iframeUri="localhost:8000" />;
```

## License

MIT
