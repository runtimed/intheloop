/**
 * Utility for prefetching chunks to improve perceived performance
 *
 * This module provides functions to prefetch JavaScript chunks that are likely
 * to be needed soon, improving the user experience by loading them in the
 * background while keeping the initial bundle small.
 */

interface PrefetchOptions {
  priority?: "high" | "low";
  timeout?: number;
}

/**
 * Creates a prefetch link element for the given chunk URL
 */
function createPrefetchLink(
  href: string,
  priority: "high" | "low" = "low"
): HTMLLinkElement {
  const link = document.createElement("link");
  link.rel = priority === "high" ? "preload" : "prefetch";
  link.as = "script";
  link.href = href;
  link.crossOrigin = "anonymous";
  return link;
}

/**
 * Prefetches a chunk by URL using link rel=prefetch
 */
function prefetchChunk(href: string, options: PrefetchOptions = {}): void {
  const { priority = "low" } = options;

  // Check if already prefetched
  const existing = document.querySelector(`link[href="${href}"]`);
  if (existing) return;

  const link = createPrefetchLink(href, priority);
  document.head.appendChild(link);
}

/**
 * Prefetches multiple chunks
 */
function prefetchChunks(hrefs: string[], options: PrefetchOptions = {}): void {
  hrefs.forEach((href) => prefetchChunk(href, options));
}

/**
 * Prefetches chunks during browser idle time
 */
function prefetchWhenIdle(
  callback: () => void,
  options: PrefetchOptions = {}
): void {
  const { timeout = 2000 } = options;

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout });
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(callback, Math.min(timeout, 1000));
  }
}

/**
 * Discovers and prefetches output component chunks
 * This is called strategically when we know outputs will likely be needed
 */
export function prefetchOutputChunks(): void {
  prefetchWhenIdle(() => {
    // Preload react-spring first as it's used on initial page load
    import("@react-spring/web").catch(() => {});

    // These imports will trigger chunk loading but won't execute the modules
    // until they're actually needed via React.lazy()
    import("@runtimed/components")
      .then((m) => m.MarkdownRenderer)
      .catch(() => {
        // Silently ignore prefetch failures
      });
    import("@runtimed/components").then((m) => m.JsonOutput).catch(() => {});
    import("@runtimed/components")
      .then((m) => m.PlainTextOutput)
      .catch(() => {});
    import("@runtimed/components").then((m) => m.HtmlOutput).catch(() => {});
    import("@runtimed/components").then((m) => m.ImageOutput).catch(() => {});
    import("@runtimed/components").then((m) => m.SvgOutput).catch(() => {});
    import("@runtimed/components")
      .then((m) => m.AiToolCallOutput)
      .catch(() => {});
    import("@runtimed/components")
      .then((m) => m.AiToolResultOutput)
      .catch(() => {});
  });
}

/**
 * Prefetches syntax highlighting chunks when markdown is likely
 */
export function prefetchSyntaxHighlighting(): void {
  prefetchWhenIdle(
    () => {
      // Only prefetch if MarkdownRenderer hasn't been loaded yet
      import("react-syntax-highlighter/dist/esm/styles/prism").catch(() => {});
    },
    { timeout: 3000 }
  );
}

/**
 * Aggressive prefetch strategy - loads most output components immediately
 * Use this when you're confident outputs will be needed soon
 */
export function prefetchOutputsAggressive(): void {
  // Use setTimeout to not block current execution
  setTimeout(() => {
    prefetchOutputChunks();
    prefetchSyntaxHighlighting();
  }, 100);
}

/**
 * Conservative prefetch strategy - loads only essential components
 * Use this for slower connections or mobile devices
 */
export function prefetchOutputsConservative(): void {
  prefetchWhenIdle(
    () => {
      // Only prefetch the most commonly used components
      import("@runtimed/components")
        .then((m) => m.PlainTextOutput)
        .catch(() => {});
      import("@runtimed/components")
        .then((m) => m.MarkdownRenderer)
        .catch(() => {});
      // Preload react-spring as it's used in the loading screen
      import("@react-spring/web").catch(() => {});
    },
    { timeout: 5000 }
  );
}

/**
 * Adaptive prefetch based on connection speed
 */
export function prefetchOutputsAdaptive(): void {
  // @ts-ignore - navigator.connection is experimental
  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (connection) {
    const effectiveType = connection.effectiveType;
    const saveData = connection.saveData;

    if (saveData) {
      // User has data saver on, be conservative
      return;
    }

    if (effectiveType === "4g") {
      prefetchOutputsAggressive();
    } else if (effectiveType === "3g") {
      prefetchOutputChunks();
    } else {
      prefetchOutputsConservative();
    }
  } else {
    // Unknown connection, use default strategy
    prefetchOutputChunks();
  }
}

// Export utility functions for advanced use cases
export { prefetchChunk, prefetchChunks, prefetchWhenIdle };
