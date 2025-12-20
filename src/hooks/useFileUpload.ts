import { useCallback, useState } from "react";
import { useAuth, useAuthenticatedUser } from "@/auth";
import { toast } from "sonner";
import { useStore } from "@livestore/react";
import { events } from "@runtimed/schema";

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
        const error = (await response
          .json()
          .catch(() => ({ error: "Upload failed" }))) as {
          error?: string;
        };
        toast.error(error.error || response.statusText);
        throw new Error(error.error || response.statusText);
      }

      const result = (await response.json()) as { artifactId: string };
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
