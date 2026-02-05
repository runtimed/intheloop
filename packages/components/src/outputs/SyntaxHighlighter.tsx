import React from "react";
import { Prism as PrismHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy } from "lucide-react";

export interface SyntaxHighlighterProps {
  /** Code content to highlight */
  children: string;
  /** Programming language for syntax highlighting */
  language?: string;
  /** Show copy button on hover (default: true) */
  enableCopy?: boolean;
  /** Custom styles to apply to the code block */
  customStyle?: React.CSSProperties;
  /** Additional class name for the container */
  className?: string;
  /** Show line numbers (default: false) */
  showLineNumbers?: boolean;
}

const defaultStyle: React.CSSProperties = {
  margin: 0,
  padding: "0.75rem",
  fontSize: "0.875rem",
  overflow: "auto",
  background: "#fafafa",
  borderRadius: "0.375rem",
};

/**
 * Syntax highlighter component using Prism.
 * Supports copy-to-clipboard and configurable styling.
 */
export const SyntaxHighlighter: React.FC<SyntaxHighlighterProps> = ({
  children,
  language = "",
  enableCopy = true,
  customStyle,
  className,
  showLineNumbers = false,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  return (
    <div className={`group/codeblock relative ${className || ""}`}>
      <PrismHighlighter
        language={language}
        style={oneLight}
        PreTag="div"
        showLineNumbers={showLineNumbers}
        customStyle={{ ...defaultStyle, ...customStyle }}
      >
        {children}
      </PrismHighlighter>
      {enableCopy && (
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 z-10 rounded border border-gray-200 bg-white p-1.5 text-gray-600 opacity-0 shadow-sm transition-opacity group-hover/codeblock:opacity-100 hover:bg-gray-50 hover:text-gray-800"
          title={copied ? "Copied!" : "Copy code"}
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      )}
    </div>
  );
};

export default SyntaxHighlighter;
