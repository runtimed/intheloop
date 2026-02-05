import { cn } from "./utils/cn";

interface ExecutionCountProps {
  count: number | null;
  isExecuting?: boolean;
  className?: string;
}

export function ExecutionCount({
  count,
  isExecuting,
  className,
}: ExecutionCountProps) {
  const display = isExecuting ? "*" : (count ?? " ");
  return (
    <span
      data-slot="execution-count"
      className={cn("text-muted-foreground font-mono text-sm", className)}
    >
      [{display}]:
    </span>
  );
}
