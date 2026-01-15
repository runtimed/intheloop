import { useCallback, useState } from "react";
import { useAuth, useAuthenticatedUser } from "@/auth";
import { toast } from "sonner";
import { useStore } from "@livestore/react";
import { events } from "@runtimed/schema";
import { uploadArtifactViaProjects } from "@runtimed/agent-core";

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

/**
 * Single-step artifact upload the backend (deprecated)
 * @deprecated Use uploadFileViaProjects instead
 */
async function uploadFileToSync(
  file: File,
  notebookId: string,
  accessToken: string,
  store: ReturnType<typeof useStore>["store"],
  userId: string,
  onFileUploaded?: FileUploadOptions["onFileUploaded"]
): Promise<string> {
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
    const error = await response
      .json()
      .catch(() => ({ error: "Upload failed" }));
    toast.error(error.error || response.statusText);
    throw new Error(error.error || response.statusText);
  }

  const result = await response.json();
  console.log("legacy artifact upload result", result);

  store.commit(
    events.fileUploaded({
      artifactId: result.artifactId,
      mimeType: file.type,
      fileName: file.name,
      createdAt: new Date(),
      createdBy: userId,
    })
  );

  onFileUploaded?.({
    artifactId: result.artifactId,
    fileName: file.name,
  });

  return result.artifactId;
}

/**
 * Projects-backed three-step artifact upload
 */
async function uploadFileViaProjects(
  file: File,
  notebookId: string,
  accessToken: string,
  store: ReturnType<typeof useStore>["store"],
  userId: string,
  onFileUploaded?: FileUploadOptions["onFileUploaded"]
): Promise<string> {
  const commitResult = await uploadArtifactViaProjects({
    baseUrl: "",
    notebookId,
    authToken: accessToken,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    body: file,
  });

  console.log("artifact upload committed", commitResult);

  store.commit(
    events.fileUploaded({
      // For Projects-backed uploads, we currently use the fileVersionId
      // as the artifact identifier. Downstream readers may evolve to
      // interpret this as a Projects file handle rather than R2 key.
      artifactId: commitResult.fileVersionId,
      mimeType: file.type,
      fileName: commitResult.fileName || file.name,
      fileUrl: commitResult.fileUrl, // Store the direct URL for Projects-backed artifacts
      createdAt: new Date(),
      createdBy: userId,
    })
  );

  onFileUploaded?.({
    artifactId: commitResult.fileVersionId,
    fileName: commitResult.fileName || file.name,
  });

  return commitResult.fileVersionId;
}

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

      const useProjectsArtifacts =
        import.meta.env.VITE_USE_PROJECTS_ARTIFACTS === "true";

      try {
        if (useProjectsArtifacts) {
          return await uploadFileViaProjects(
            file,
            notebookId,
            accessToken!,
            store,
            userId,
            onFileUploaded
          );
        } else {
          return await uploadFileToSync(
            file,
            notebookId,
            accessToken!,
            store,
            userId,
            onFileUploaded
          );
        }
      } finally {
        setIsUploading(false);
      }
    },
    [accessToken, notebookId, isAuthenticated, onFileUploaded, store, userId]
  );

  return {
    isUploading,
    uploadFile,
  };
};
