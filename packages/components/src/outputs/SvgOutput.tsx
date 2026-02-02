import { throwIfNotInIframe } from "../utils/iframe.js";
import React from "react";

interface SvgOutputProps {
  content: string;
}

export const SvgOutput: React.FC<SvgOutputProps> = ({ content }) => {
  throwIfNotInIframe();

  return (
    <div className="py-2">
      <div
        className="max-w-full overflow-hidden"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
};

export default SvgOutput;
