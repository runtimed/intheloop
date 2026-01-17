import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Upload, Plus } from "lucide-react";
import { type ComponentProps, useRef, useCallback } from "react";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useStore } from "@livestore/react";
import { useAuthenticatedUser } from "@/auth";
import { useAddCell } from "@/hooks/useAddCell";
import { events } from "@runtimed/schema";
import { toast } from "sonner";
import { MAX_FILE_UPLOAD_SIZE } from "../../../../shared/constants";
import prettyBytes from "pretty-bytes";

interface CsvUploadButtonProps
  extends Omit<ComponentProps<typeof Button>, "children"> {
  showPlus?: boolean;
  label?: string;
  position?: "before" | "after";
  cellId?: string;
}

export function CsvUploadButton({
  showPlus = false,
  position = "after",
  cellId,
  className,
  ...props
}: CsvUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { store } = useStore();
  const userId = useAuthenticatedUser();
  const { addCell } = useAddCell();
  const { uploadFile, isUploading } = useFileUpload({
    notebookId: store.storeId,
    onFileUploaded: ({ fileName }) => {
      toast.success(`File uploaded: ${fileName}`);
      // Create a new code cell with CSV loading code
      const newCellId = addCell(cellId, "code", position);

      // Set the cell content to load the CSV
      const csvCode = `import pandas as pd
df = pd.read_csv('${fileName}')
df.head()`;

      store.commit(
        events.cellSourceChanged({
          id: newCellId,
          source: csvCode,
          modifiedBy: userId,
        })
      );
    },
  });

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      console.log("file", file);
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

      if (file.type === "text/csv") {
        console.log("uploading file", file);
        uploadFile(file);
      } else {
        // Show error for non-CSV files
        toast.error("Please select a CSV file");
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [uploadFile]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        variant="outline"
        className={cn(
          "border-green-300 text-green-600 hover:bg-green-50 hover:text-green-600 focus:bg-green-50 focus-visible:border-green-500 focus-visible:ring-green-100",
          "flex items-center gap-1.5",
          className
        )}
        onClick={handleClick}
        disabled={isUploading}
        {...props}
      >
        {showPlus && (
          <Plus className={props.size === "lg" ? "h-4 w-4" : "h-3 w-3"} />
        )}
        <Upload className={props.size === "lg" ? "h-4 w-4" : "h-3 w-3"} />
        {isUploading ? "Uploading..." : "Upload CSV"}
      </Button>
    </>
  );
}
