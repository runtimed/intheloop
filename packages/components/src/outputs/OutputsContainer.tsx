import React from "react";

/**
 * We don't want to render this until the contents are ready to be displayed because it has a non-zero height.
 * For example, we want to render this inside the suspense boundary.
 */
export function OutputsContainer({ children }: { children: React.ReactNode }) {
  return <div className="outputs-container px-1.5 py-2">{children}</div>;
}
