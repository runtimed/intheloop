import { Suspense } from "react";
import { Spinner, type SpinnerSize } from "../ui/Spinner.js";

import React from "react";
import { useTimeout } from "react-use";

export function DelayedSpinner({
  size = "md",
  delay = 200,
}: {
  size?: SpinnerSize;
  delay?: number;
}) {
  "use no memo";

  const [isReady] = useTimeout(delay);

  return isReady() ? <LoadingSpinner size={size} /> : null;
}

export function SuspenseSpinner({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<DelayedSpinner />}>{children}</Suspense>;
}

const LoadingSpinner = ({ size = "md" }: { size?: SpinnerSize }) => (
  <div className="p-1 text-black/50">
    <Spinner size={size} />
  </div>
);
