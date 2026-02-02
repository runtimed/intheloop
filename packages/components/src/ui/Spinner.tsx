import { cn } from "../utils/cn.js";
import { LoaderIcon, type LucideProps } from "lucide-react";

export type SpinnerSize = "sm" | "md" | "lg";

type SpinnerProps = LucideProps & {
  size?: SpinnerSize;
};

export const Spinner = ({ className, size = "sm", ...props }: SpinnerProps) => (
  <LoaderIcon
    className={cn(
      "size-4 animate-spin",
      {
        "text-muted-foreground size-3": size === "sm",
        "text-muted-foreground/50 size-4": size === "md",
        "text-muted-foreground/70 size-6": size === "lg",
      },
      className
    )}
    {...props}
  />
);
