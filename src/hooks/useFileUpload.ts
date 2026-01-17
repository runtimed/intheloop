import { useCallback, useState } from "react";
import { useAuth, useAuthenticatedUser } from "@/auth";
import { toast } from "sonner";
import { useStore } from "@livestore/react";
import { events } from "@runtimed/schema";
import { MAX_FILE_UPLOAD_SIZE } from "../../shared/constants";
import prettyBytes from "pretty-bytes";

interface FileUploadOptions {
  notebookId: string;
  onFileUploaded?: ({
    artifactId,
    fileName,
  }: {
    artifactId: string;
    fileName: string;
  }) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const useFileUpload = ({
  notebookId,
  onFileUploaded,
}: FileUploadOptions) => {
  const { store } = useStore();
  const userId = useAuthenticatedUser();
  const { accessToken, isAuthenticated } = useAuth();
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = useCallback(
    async (file: File): Promise<string> => {
      console.log("uploadFile", file);
      if (!isAuthenticated) {
        const message = "User must be authenticated to upload files";
        toast.error(message);
        setIsUploading(false);
        throw new Error(message);
      }

      // Check file size before upload
      if (file.size > MAX_FILE_UPLOAD_SIZE) {
        const message = `File size (${prettyBytes(file.size)}) exceeds the maximum allowed size of ${prettyBytes(MAX_FILE_UPLOAD_SIZE)}`;
        toast.error(message);
        setIsUploading(false);
        throw new Error(message);
      }

      setIsUploading(true);
      await sleep(500);

      const response = await fetch("/api/artifacts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-notebook-id": notebookId,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!response.ok) {
        setIsUploading(false);
        const error = await response
          .json()
          .catch(() => ({ error: "Upload failed", message: "Upload failed" }));
        const errorMessage =
          error.message || error.error || response.statusText;
        toast.error(errorMessage);
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log("result", result);

      store.commit(
        events.fileUploaded({
          artifactId: result.artifactId,
          mimeType: file.type,
          fileName: file.name,
          createdAt: new Date(),
          createdBy: userId,
        })
      );

      setIsUploading(false);
      onFileUploaded?.({ artifactId: result.artifactId, fileName: file.name });

      return result.artifactId;
    },
    [accessToken, notebookId, isAuthenticated, onFileUploaded, store, userId]
  );

  return {
    isUploading,
    uploadFile,
  };
};
