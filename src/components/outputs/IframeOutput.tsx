import React from "react";
import {
  IframeOutput as BaseIframeOutput,
  type IframeOutputProps,
} from "@runtimed/components";

/**
 * Wrapper component that provides iframeUri from environment variable
 */
export const IframeOutput: React.FC<Omit<IframeOutputProps, "iframeUri">> = (
  props
) => {
  const iframeUri =
    import.meta.env.VITE_IFRAME_OUTPUT_URI || "http://localhost:8000";
  return <BaseIframeOutput {...props} iframeUri={iframeUri} />;
};
