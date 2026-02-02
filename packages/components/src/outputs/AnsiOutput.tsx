import React from "react";
import AnsiModule from "ansi-to-react";

// Handle nested default export from ansi-to-react
// Some bundlers create mod.default.default structure
const Ansi =
  (AnsiModule as any).default?.default ||
  (AnsiModule as any).default ||
  AnsiModule;

interface AnsiOutputProps {
  children: string;
  className?: string;
  isError?: boolean;
}

/**
 * AnsiOutput component for rendering ANSI escape sequences as colored text
 *
 * This component preserves the beautiful colored output that developers expect
 * while using ansi-to-react to convert ANSI codes to styled React elements.
 *
 * For AI context, use cleanForAI() utility to strip ANSI codes.
 * For user display, use this component to render the colors.
 */
export const AnsiOutput: React.FC<AnsiOutputProps> = ({
  children,
  className = "",
  isError = false,
}) => {
  if (!children || typeof children !== "string") {
    return null;
  }

  const baseClasses = `font-mono text-sm whitespace-pre-wrap leading-relaxed ${className}`;
  const errorClasses = isError ? "text-red-600" : "";
  const finalClasses = `${baseClasses} ${errorClasses}`.trim();

  return (
    <div className={finalClasses}>
      <Ansi useClasses={false}>{children}</Ansi>
    </div>
  );
};

/**
 * AnsiStreamOutput component specifically for stdout/stderr rendering
 */
export const AnsiStreamOutput: React.FC<{
  text: string;
  streamName: "stdout" | "stderr";
  className?: string;
}> = ({ text, streamName, className = "" }) => {
  const isStderr = streamName === "stderr";
  const streamClasses = isStderr ? "text-red-600" : "text-gray-700";

  return (
    <div className={`py-2 ${streamClasses} ${className}`}>
      <AnsiOutput isError={isStderr}>{text}</AnsiOutput>
    </div>
  );
};

/**
 * AnsiErrorOutput component specifically for error messages and tracebacks
 */
export const AnsiErrorOutput: React.FC<{
  ename?: string;
  evalue?: string;
  traceback?: string[] | string;
  className?: string;
}> = ({ ename, evalue, traceback, className = "" }) => {
  return (
    <div className={`border-l-2 border-red-200 py-3 pl-1 ${className}`}>
      {ename && evalue && (
        <div className="mb-1 font-semibold text-red-700">
          <AnsiOutput isError>{`${ename}: ${evalue}`}</AnsiOutput>
        </div>
      )}
      {traceback && (
        <div className="mt-2 text-xs text-red-600 opacity-80">
          <AnsiOutput isError>
            {Array.isArray(traceback) ? traceback.join("\n") : traceback}
          </AnsiOutput>
        </div>
      )}
    </div>
  );
};
