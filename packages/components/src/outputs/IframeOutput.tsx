import type { CellType, OutputData } from "@runtimed/schema";
import { useState, useRef, useEffect } from "react";
import { useDebounce } from "react-use";
import { useIframeCommsParent } from "./comms.js";

export interface IframeOutputProps {
  outputs: OutputData[];
  style?: React.CSSProperties;
  className?: string;
  onHeightChange?: (height: number) => void;
  isReact?: boolean;
  defaultHeight?: string;
  onDoubleClick?: () => void;
  onMarkdownRendered?: () => void;
  cellType?: CellType;
  iframeUri: string;
}

export const IframeOutput: React.FC<IframeOutputProps> = ({
  outputs,
  className,
  style,
  isReact,
  onHeightChange,
  defaultHeight = "0px",
  onDoubleClick,
  onMarkdownRendered,
  cellType,
  iframeUri,
}) => {
  const { iframeRef, iframeHeight } = useIframeCommsParent({
    defaultHeight,
    onHeightChange,
    outputs,
    onDoubleClick,
    onMarkdownRendered,
  });

  const [debouncedIframeHeight, setDebouncedIframeHeight] =
    useState(iframeHeight);

  // Iframe can get height updates pretty often, but we want to avoid layout jumping each time
  // TODO: ensure that it's a leading debounce!
  useDebounce(() => setDebouncedIframeHeight(iframeHeight), 50, [iframeHeight]);

  const isAiCell = cellType === "ai";
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when content changes for AI cells
  useEffect(() => {
    if (isAiCell && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [isAiCell, outputs, debouncedIframeHeight]);

  const iframeElement = (
    <iframe
      src={iframeUri + (isReact ? "/react.html" : "")}
      ref={iframeRef}
      className={className}
      width="100%"
      height={debouncedIframeHeight}
      style={style}
      allow="accelerometer; autoplay; gyroscope; magnetometer; xr-spatial-tracking; clipboard-write; fullscreen"
      sandbox="allow-downloads allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-modals allow-top-navigation-by-user-activation"
      loading="lazy"
    />
  );

  if (isAiCell) {
    return (
      <div ref={scrollContainerRef} className="max-h-[30vh] overflow-y-auto">
        {iframeElement}
      </div>
    );
  }

  return iframeElement;
};
