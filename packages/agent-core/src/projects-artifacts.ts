/**
 * Shared helper for three-step artifact uploads via the Projects service.
 *
 * This is used by:
 * - Frontend web client (notebook UI) via @runtimed/agent-core
 * - Runtime agents via ArtifactClient
 *
 * It performs:
 * 1) POST /api/artifacts/:filename/init   → { uploadUrl, fileUrl, fileVersionId }
 * 2) PUT  uploadUrl                       → binary upload
 * 3) POST /api/artifacts/:filename/commit → finalize upload
 */

export interface ProjectsArtifactUploadParams {
  /**
   * Base URL for the backend.
   *
   * Examples:
   * - ""                    → relative /api/... (browser)
   * - "https://app.runt.run" → absolute URL (agents)
   */
  baseUrl: string;

  /** Notebook ID for x-notebook-id header */
  notebookId: string;

  /** Bearer token for Authorization header */
  authToken: string;

  /** Logical filename for this artifact (used in the route path) */
  filename: string;

  /** MIME type for the binary upload */
  mimeType: string;

  /**
   * Binary body to upload in step 2.
   * In browsers this is typically a File/Blob.
   * In agents this is usually an ArrayBuffer or Uint8Array.
   */
  body: any;
}

export interface ProjectsArtifactUploadResult {
  /** Convenience alias for downstream code (currently fileVersionId) */
  artifactId: string;
  fileVersionId: string;
  fileName: string;
  fileUrl: string;
}

function buildApiBase(baseUrl: string): string {
  // Normalize so that "" → "" and "https://host" → "https://host"
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed;
}

export async function uploadArtifactViaProjects(
  params: ProjectsArtifactUploadParams
): Promise<ProjectsArtifactUploadResult> {
  const {
    baseUrl,
    notebookId,
    authToken,
    filename,
    // mimeType is intentionally not used - pre-signed URLs are sensitive to headers
    // and adding Content-Type can break the signature if it wasn't part of the signed request
    body,
  } = params;

  // Suppress unused parameter warning - mimeType is part of the interface contract
  // but we can't use it in the upload step without potentially breaking the signature
  void params.mimeType;

  const apiBase = buildApiBase(baseUrl);
  const safeFilename = encodeURIComponent(filename || "artifact.bin");

  // Step 1: Initialize upload
  const initUrl = `${apiBase}/api/artifacts/${safeFilename}/init`;
  const initHeaders: Record<string, string> = {
    authorization: `Bearer ${authToken}`,
    "x-notebook-id": notebookId,
    "content-type": "application/json",
  };

  const initResponse = await fetch(initUrl, {
    method: "POST",
    headers: initHeaders,
    body: JSON.stringify({}),
  });

  if (!initResponse.ok) {
    const error = await initResponse.json().catch(() => ({
      error: "Unknown error",
    }));
    throw new Error(
      `Artifact init failed: ${error.error || initResponse.statusText}`
    );
  }

  const initResult = (await initResponse.json()) as {
    uploadUrl: string;
    fileUrl: string;
    fileVersionId: string;
  };

  // Step 2: Upload binary directly to pre-signed URL
  // IMPORTANT: Pre-signed URLs are sensitive to headers. The signature was generated
  // with specific headers (or no headers). We must not add headers that weren't
  // part of the signature, or the signature validation will fail.
  //
  // For S3/R2 pre-signed URLs, if Content-Type was included in the signature,
  // it must match exactly. If it wasn't included, adding it will break the signature.
  // The Projects service should generate the URL with the correct headers already
  // embedded in the signature.
  //
  // CRITICAL: Browsers automatically add Content-Type header when body is File/Blob.
  // To prevent this, we convert File/Blob to ArrayBuffer, which doesn't trigger
  // automatic Content-Type detection.
  let uploadBody: BodyInit;
  if (body instanceof File || body instanceof Blob) {
    // Convert File/Blob to ArrayBuffer to prevent browser from auto-adding Content-Type
    uploadBody = await body.arrayBuffer();
  } else {
    // Other types (ArrayBuffer, Uint8Array, etc.) are already valid BodyInit
    // and don't trigger automatic Content-Type detection
    uploadBody = body;
  }

  const uploadResponse = await fetch(initResult.uploadUrl, {
    method: "PUT",
    // Do not add any headers - the pre-signed URL signature is sensitive to them
    // Converting File/Blob to ArrayBuffer prevents browser from auto-adding Content-Type
    body: uploadBody,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => "Unknown error");
    throw new Error(
      `Artifact binary upload failed: ${errorText || uploadResponse.statusText}`
    );
  }

  // Step 3: Commit upload
  const commitUrl = `${apiBase}/api/artifacts/${safeFilename}/commit`;
  const commitHeaders: Record<string, string> = {
    authorization: `Bearer ${authToken}`,
    "x-notebook-id": notebookId,
    "content-type": "application/json",
  };

  const commitResponse = await fetch(commitUrl, {
    method: "POST",
    headers: commitHeaders,
    body: JSON.stringify({
      fileVersionId: initResult.fileVersionId,
    }),
  });

  if (!commitResponse.ok) {
    const error = await commitResponse.json().catch(() => ({
      error: "Unknown error",
    }));
    throw new Error(
      `Artifact commit failed: ${error.error || commitResponse.statusText}`
    );
  }

  const commitResult = (await commitResponse.json()) as {
    status: string;
    notebookId: string;
    fileName: string;
    fileVersionId: string;
  };

  return {
    artifactId: commitResult.fileVersionId,
    fileVersionId: commitResult.fileVersionId,
    fileName: commitResult.fileName,
    fileUrl: initResult.fileUrl,
  };
}
