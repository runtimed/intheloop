import { useQuery, useStore } from "@livestore/react";
import { events, FileData } from "@runtimed/schema";
import React, { useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import type { SidebarPanelProps } from "./types";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SidebarMenu, SidebarProvider } from "@/components/ui/sidebar";
import { useFileUpload } from "@/hooks/useFileUpload";
import { cn } from "@/lib/utils";
import { availableFiles$ } from "@/queries";
import { File, FileText, Image, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { MAX_FILE_UPLOAD_SIZE } from "../../../../shared/constants";
import prettyBytes from "pretty-bytes";

export const FilesPanel: React.FC<SidebarPanelProps> = () => {
  const files = useQuery(availableFiles$);

  const { store } = useStore();

  const { uploadFile, isUploading } = useFileUpload({
    notebookId: store.storeId,
    onFileUploaded: ({ fileName }) => {
      toast.success(`File uploaded: ${fileName}`);
    },
  });

  const handleDelete = useCallback(
    (fileName: string) => {
      store.commit(events.fileDeleted2({ fileName, deletedAt: new Date() }));
    },
    [store]
  );

  if (!files || files.length === 0)
    return (
      <div className="space-y-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <File className="size-6" />
            </EmptyMedia>
            <EmptyTitle>No files uploaded</EmptyTitle>
            <EmptyDescription>
              Upload files to share them available to your notebook and AI
              agents.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <UploadButton uploadFile={uploadFile} isUploading={isUploading} />
          </EmptyContent>
        </Empty>
        <LookingForYourNotebooksLink />
      </div>
    );

  return (
    <div className="-m-2 space-y-6">
      <SidebarProvider>
        <SidebarMenu>
          {files.map((file) => (
            <FileItem
              key={file.fileName + "-" + file.artifactId}
              name={file.fileName}
              file={file}
              onDelete={() => handleDelete(file.fileName)}
            />
          ))}
          <UploadButton uploadFile={uploadFile} isUploading={isUploading} />
          <LookingForYourNotebooksLink />
        </SidebarMenu>
      </SidebarProvider>
    </div>
  );
};

function LookingForYourNotebooksLink() {
  return (
    <div className="mt-6 text-center text-sm text-pretty text-gray-500">
      Looking for your notebooks? Find them on the{" "}
      <Link
        to="/nb"
        className="font-medium underline hover:text-gray-900 hover:underline"
      >
        dashboard
      </Link>
      .
    </div>
  );
}

function UploadButton({
  uploadFile,
  isUploading,
}: {
  uploadFile: (file: File) => void;
  isUploading: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      if (file.size > MAX_FILE_UPLOAD_SIZE) {
        toast.error(
          `File size (${prettyBytes(file.size)}) exceeds the maximum allowed size of ${prettyBytes(MAX_FILE_UPLOAD_SIZE)}`
        );
        // Reset input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      uploadFile(file);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [uploadFile]
  );

  return (
    <div
      className={cn(
        buttonVariants({ size: "sm", variant: "outline" }),
        "relative"
      )}
    >
      <Upload />
      {isUploading ? "Uploading..." : "Upload File"}
      <input
        ref={fileInputRef}
        disabled={isUploading}
        type="file"
        className="absolute inset-0 appearance-none opacity-0"
        onChange={handleFileSelect}
      />
    </div>
  );
}

function FileItem({
  name,
  file,
  onDelete,
}: {
  name: string;
  file: FileData;
  onDelete?: () => void;
}) {
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.currentTarget.focus();
  };

  return (
    <SimpleTooltip content={name}>
      <div
        tabIndex={0}
        onClick={handleClick}
        className={cn(
          buttonVariants({ size: "sm", variant: "ghost" }),
          "group/tree-item focus:bg-gray-100"
        )}
      >
        <FileIcon file={file} />
        <span className="truncate">{name}</span>
        <div className="grow"></div>
        <Button
          onClick={onDelete}
          size="xs"
          variant="destructiveGhost"
          className="hidden group-focus-within/tree-item:block group-hover/tree-item:block"
        >
          <Trash2 />
        </Button>
      </div>
    </SimpleTooltip>
  );
}

function FileIcon({ file }: { file: FileData }) {
  if (file.mimeType.startsWith("image/")) {
    return <Image />;
  }
  if (file.mimeType.startsWith("text/")) {
    return <FileText />;
  }
  if (file.mimeType.startsWith("application/")) {
    return <File />;
  }
  return <File />;
}
