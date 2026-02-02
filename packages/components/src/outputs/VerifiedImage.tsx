import { useState, useEffect, useRef } from "react";
import type { ImgHTMLAttributes } from "react";

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5000;
const IMAGE_LOAD_TIMEOUT_MS = 15000;

interface VerifiedImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt?: string;
}

/**
 * Verifies that an image URL can be loaded before rendering it.
 * Used for images in markdown content.
 */
export const VerifiedImage: React.FC<VerifiedImageProps> = ({
  src,
  alt,
  ...props
}) => {
  const [isReady, setIsReady] = useState(false);
  const [imageSrc, setImageSrc] = useState<string>(src);
  const [retryCount, setRetryCount] = useState(0);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  // Only verify fetch for HTTP/HTTPS URLs (not data URIs or base64)
  const shouldVerifyFetch = (url: string): boolean => {
    return (
      (url.startsWith("http://") ||
        url.startsWith("https://") ||
        url.startsWith("/")) &&
      !url.startsWith("data:")
    );
  };

  useEffect(() => {
    isMountedRef.current = true;

    // For data URIs or base64, render immediately
    if (!shouldVerifyFetch(src)) {
      setImageSrc(src);
      setIsReady(true);
      return;
    }

    // For HTTP URLs, preload the image using an Image object before rendering
    setIsReady(false);
    setRetryCount(0);

    const preloadImage = (baseUrl: string, attempt: number = 0): void => {
      // Clean up previous image and timeout
      if (imageRef.current) {
        imageRef.current.onload = null;
        imageRef.current.onerror = null;
        imageRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Add cache-busting parameter for retries
      const loadUrl =
        attempt > 0
          ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}_retry=${attempt}&_t=${Date.now()}`
          : baseUrl;

      const img = new Image();
      imageRef.current = img;

      // Set up timeout
      const timeoutId = window.setTimeout(() => {
        if (!isMountedRef.current) return;

        img.onload = null;
        img.onerror = null;

        // Retry if we haven't exceeded max retries
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(
            INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
            MAX_RETRY_DELAY_MS
          );

          setTimeout(() => {
            if (isMountedRef.current) {
              setRetryCount(attempt + 1);
              preloadImage(baseUrl, attempt + 1);
            }
          }, delay);
        } else {
          // Max retries exceeded, render anyway (will show broken image)
          setImageSrc(baseUrl);
          setIsReady(true);
        }
      }, IMAGE_LOAD_TIMEOUT_MS);
      timeoutRef.current = timeoutId;

      img.onload = () => {
        if (!isMountedRef.current) return;

        clearTimeout(timeoutRef.current!);
        timeoutRef.current = null;

        // Use original URL for rendering (without cache-busting params)
        setImageSrc(baseUrl);
        setIsReady(true);

        // Clean up
        img.onload = null;
        img.onerror = null;
        imageRef.current = null;
      };

      img.onerror = () => {
        if (!isMountedRef.current) return;

        clearTimeout(timeoutRef.current!);
        timeoutRef.current = null;

        // Retry if we haven't exceeded max retries
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(
            INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
            MAX_RETRY_DELAY_MS
          );

          setTimeout(() => {
            if (isMountedRef.current) {
              setRetryCount(attempt + 1);
              preloadImage(baseUrl, attempt + 1);
            }
          }, delay);
        } else {
          // Max retries exceeded, render anyway (will show broken image)
          setImageSrc(baseUrl);
          setIsReady(true);
        }

        // Clean up
        img.onload = null;
        img.onerror = null;
        imageRef.current = null;
      };

      // Start loading the image
      img.src = loadUrl;
    };

    preloadImage(src);

    // Cleanup on unmount or src change
    return () => {
      isMountedRef.current = false;
      if (imageRef.current) {
        imageRef.current.onload = null;
        imageRef.current.onerror = null;
        imageRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [src]);

  // Don't render until image is verified (or is a data URI)
  if (!isReady) {
    return (
      <span className="inline-block align-middle text-xs text-gray-500">
        {retryCount > 0
          ? `Loading image... (retry ${retryCount}/${MAX_RETRIES})`
          : "Loading image..."}
      </span>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className="h-auto max-w-full"
      style={{ objectFit: "contain" }}
      {...props}
    />
  );
};

export default VerifiedImage;
