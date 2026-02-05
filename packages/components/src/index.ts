// Output components
export { IframeOutput } from "./outputs/IframeOutput.js";
export type { IframeOutputProps } from "./outputs/IframeOutput.js";

export { SingleOutput } from "./outputs/SingleOutput.js";
export { OutputsContainer } from "./outputs/OutputsContainer.js";
export { SuspenseSpinner, DelayedSpinner } from "./outputs/SuspenseSpinner.js";
export { RichOutputContent } from "./outputs/RichOutputContent.js";

// Iframe React app for rendering outputs in an iframe
export { IframeReactApp } from "./iframe-outputs/IframeReactApp.js";

// Specific output renderers
export {
  AnsiOutput,
  AnsiStreamOutput,
  AnsiErrorOutput,
} from "./outputs/AnsiOutput.js";
export { PlainTextOutput } from "./outputs/PlainTextOutput.js";
export { MarkdownRenderer } from "./outputs/MarkdownRenderer.js";
export { JsonOutput } from "./outputs/JsonOutput.js";
export { HtmlOutput } from "./outputs/HtmlOutput.js";
export { ImageOutput } from "./outputs/ImageOutput.js";
export { SvgOutput } from "./outputs/SvgOutput.js";
export { GeoJsonMapOutput } from "./outputs/geojson/GeoJsonMapOutput.js";
export { MapFeature } from "./outputs/geojson/MapFeature.js";
export {
  normalizeData,
  mapFitFeatures2,
  geoJsonTypes,
} from "./outputs/geojson/geojson-utils.js";
export type {
  MapFitFeaturesResult,
  MapFitFeaturesOptions,
} from "./outputs/geojson/geojson-utils.js";

// AI tool outputs
export { AiToolCallOutput } from "./outputs/AiToolCallOutput.js";
export { AiToolResultOutput } from "./outputs/AiToolResultOutput.js";
export { AiToolApprovalOutput } from "./outputs/AiToolApprovalOutput.js";

// Iframe communication utilities
export {
  sendFromIframe,
  sendToIframe,
  addParentMessageListener,
  removeParentMessageListener,
  useIframeCommsParent,
  useIframeCommsChild,
} from "./outputs/comms.js";
export type { ToIframeEvent, FromIframeEvent } from "./outputs/comms.js";

// UI components
export { Button, buttonVariants } from "./ui/button.js";
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card.js";
export { Spinner } from "./ui/Spinner.js";
export type { SpinnerSize } from "./ui/Spinner.js";
export { ExecutionCount } from "./ExecutionCount.js";

// Utilities
export { cn } from "./utils/cn.js";
export { throwIfNotInIframe } from "./utils/iframe.js";
export { groupConsecutiveStreamOutputs } from "./utils/output-grouping.js";

// Demo pages
export { OutputTypesDemoPage } from "./OutputTypesDemoPage.js";
export { Incrementor } from "./Incrementor.js";

// Re-export types from schema for convenience
export type {
  OutputData,
  OutputType,
  CellType,
  AiToolCallData,
  AiToolResultData,
} from "@runtimed/schema";
