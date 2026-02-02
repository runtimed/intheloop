import React from "react";

interface ImageOutputProps {
  src: string;
  alt?: string;
  mediaType: "image/png" | "image/jpeg";
}

export const ImageOutput: React.FC<ImageOutputProps> = ({
  src,
  alt = "Output image",
  mediaType,
}) => {
  const imageSrc =
    src.startsWith("data:") || src.startsWith("/") || src.startsWith("http")
      ? src
      : `data:${mediaType};base64,${src}`;

  return (
    <div className="py-2">
      <img
        src={imageSrc}
        alt={alt}
        className="h-auto max-w-full"
        style={{ objectFit: "contain" }}
      />
    </div>
  );
};

export default ImageOutput;
