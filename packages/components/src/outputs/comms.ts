// NOTE: code here is shared between the iframe and the parent page.
// It's done to colocate types to ensure typesafety across the two bundles.

import type { OutputData } from "@runtimed/schema";
import { useEffect, useRef, useState } from "react";

type UpdateOutputsEvent = {
  type: "update-outputs";
  outputs: OutputData[];
};

type IframeLoadedEvent = {
  type: "iframe-loaded";
};

type IframeHeightEvent = {
  type: "iframe-height";
  height: number;
};

type IframeDoubleClickEvent = {
  type: "iframe-double-click";
};

type IframeMarkdownRenderedEvent = {
  type: "iframe-markdown-rendered";
};

export type ToIframeEvent = UpdateOutputsEvent;
export type FromIframeEvent =
  | IframeHeightEvent
  | IframeLoadedEvent
  | IframeDoubleClickEvent
  | IframeMarkdownRenderedEvent;

export function sendFromIframe(event: FromIframeEvent) {
  window.parent.postMessage(event, "*");
}

export function sendToIframe(
  iframeElement: HTMLIFrameElement,
  data: ToIframeEvent
) {
  if (iframeElement.contentWindow) {
    iframeElement.contentWindow.postMessage(data, "*");
  } else {
    console.error("Iframe element is not loaded");
  }
}

export function addParentMessageListener(
  cb: (event: MessageEvent<FromIframeEvent>) => void
) {
  window.addEventListener("message", cb);
}

export function removeParentMessageListener(
  cb: (event: MessageEvent<FromIframeEvent>) => void
) {
  window.removeEventListener("message", cb);
}

export function useIframeCommsParent({
  defaultHeight,
  onHeightChange,
  outputs,
  onDoubleClick,
  onMarkdownRendered,
}: {
  defaultHeight: string;
  onHeightChange?: (height: number) => void;
  outputs?: OutputData[];
  onDoubleClick?: () => void;
  onMarkdownRendered?: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeHeight, setIframeHeight] = useState<string>(defaultHeight);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<FromIframeEvent>) => {
      // Verify the message is from our iframe
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      // Check if the message contains height data
      if (
        event.data &&
        typeof event.data === "object" &&
        event.data.type === "iframe-height"
      ) {
        const height = event.data.height;
        if (typeof height === "number" && height > 0) {
          const newHeight = `${height}px`;
          setIframeHeight(newHeight);
          onHeightChange?.(height);
        }
      }

      if (event.data && event.data.type === "iframe-loaded") {
        setIframeLoaded(true);
      }
      if (event.data && event.data.type === "iframe-double-click") {
        onDoubleClick?.();
      }
      if (event.data && event.data.type === "iframe-markdown-rendered") {
        onMarkdownRendered?.();
      }
    };

    // Add message listener
    addParentMessageListener(handleMessage);

    return () => {
      removeParentMessageListener(handleMessage);
    };
  }, [onHeightChange, onDoubleClick, onMarkdownRendered]);

  useEffect(() => {
    // We cannot send content to iframe before it is loaded
    if (!iframeLoaded) {
      return;
    }
    // Send content to iframe when it changes
    if (iframeRef.current && iframeRef.current.contentWindow) {
      sendToIframe(iframeRef.current, {
        type: "update-outputs",
        outputs: outputs || [],
      });
    }
  }, [outputs, iframeLoaded]);

  return {
    iframeRef,
    iframeLoaded,
    iframeHeight,
  };
}

export function useIframeCommsChild() {
  const [outputs, setOutputs] = useState<OutputData[]>([]);

  useEffect(() => {
    function sendHeight() {
      const BUFFER = 1; // Add a small buffer to prevent scrollbars
      const height = document.body.scrollHeight;
      sendFromIframe({
        type: "iframe-height",
        height: height + BUFFER,
      });
    }

    // Send height on load
    sendHeight();

    // Handle incoming content updates
    window.addEventListener("message", (event: MessageEvent<ToIframeEvent>) => {
      const data = event.data;
      if (data && data.type === "update-outputs") {
        setOutputs(data.outputs || []);
        setTimeout(sendHeight, 50);
      }
    });

    // After the MutationObserver setup
    const resizeObserver = new ResizeObserver(sendHeight);
    resizeObserver.observe(document.documentElement); // or document.body, or your content container

    // Capture-phase load listener to catch <img>, <video>, <iframe> loads
    document.addEventListener("load", sendHeight, true);

    // Fonts can also change height when they finish loading
    if ("fonts" in document) {
      // Fire once all current fonts are ready
      (document as any).fonts.ready
        .then(() => {
          if ((document.fonts as any).size > 0) {
            sendHeight();
          }
        })
        .catch(() => {});
    }

    return () => {
      resizeObserver.disconnect();
      document.removeEventListener("load", sendHeight, true);
    };
  }, []);

  return {
    outputs,
  };
}
