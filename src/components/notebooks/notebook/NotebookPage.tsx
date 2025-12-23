import { ArrowLeft, ArrowUp } from "lucide-react";
import React, { RefObject, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useScroll } from "react-use";

import { CustomLiveStoreProvider } from "../../../livestore/index.js";
import { LoadingState } from "../../loading/LoadingState.js";

import { NotebookContent } from "../../notebook/NotebookContent.js";
import { NotebookSidebar } from "../../notebook/NotebookSidebar.js";

import { useMinWidth } from "@/hooks/use-breakpoint.js";
import { ChatModeProvider } from "@/hooks/useChatMode.js";
import {
  DragDropScrollArea,
  DragDropSortProvider,
} from "@/hooks/useDragDropCellSort.js";
import { useConsoleRuntimeLauncher } from "../../../runtime/setup-console-launcher.js";
import { Button } from "../../ui/button.js";
import { SharingDialog } from "../SharingDialog.js";
import type { NotebookProcessed } from "../types.js";
import { useNavigateToCanonicalUrl, useNotebook } from "./helpers.js";
import { NotebookHeader } from "./NotebookHeader.js";
import { AvailableAiModelsProvider } from "@/util/ai-models.js";
import { SidebarItemProvider } from "@/contexts/SidebarItemContext.js";
import { CellFilterProvider } from "@/contexts/CellFilterContext.js";

export const NotebookPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  if (!id) return <div>No notebook id</div>;

  return (
    <CustomLiveStoreProvider storeId={id}>
      <CellFilterProvider>
        <ChatModeProvider>
          <SidebarItemProvider>
            <NotebookPageWithId id={id} />
          </SidebarItemProvider>
        </ChatModeProvider>
      </CellFilterProvider>
    </CustomLiveStoreProvider>
  );
};

function NotebookPageWithId({ id }: { id: string }) {
  // Setup console runtime launcher for this notebook
  useConsoleRuntimeLauncher();

  const location = useLocation();
  // Get initial notebook data from router state (if navigated from creation)
  const initialNotebook = location.state?.initialNotebook as
    | NotebookProcessed
    | undefined;

  const { notebook, isLoading, error, refetch } = useNotebook(
    id,
    initialNotebook
  );

  if (isLoading && !initialNotebook) {
    return <LoadingState variant="fullscreen" message="Loading notebook..." />;
  }

  if (error || !notebook) {
    return <NotebookError error={error} />;
  }

  return (
    <AvailableAiModelsProvider>
      <NotebookPageWithIdAndNotebook notebook={notebook} refetch={refetch} />
    </AvailableAiModelsProvider>
  );
}

function NotebookPageWithIdAndNotebook({
  notebook,
  refetch,
}: {
  notebook: NotebookProcessed;
  refetch: () => void;
}) {
  useNavigateToCanonicalUrl(notebook);

  const isLargeScreen = useMinWidth("lg");
  const [isSharingDialogOpen, setIsSharingDialogOpen] = useState(false);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const nbContentScrollRef = useRef<HTMLDivElement>(null);

  const { y: scrollY } = useScroll(
    nbContentScrollRef as RefObject<HTMLElement>
  );
  const isScrolled = scrollY > 0;

  return (
    <div className="flex h-screen w-full">
      <NotebookSidebar
        notebook={notebook}
        onUpdate={refetch}
        onAiPanelToggle={setIsAiPanelOpen}
      />

      <div
        className={`flex flex-1 flex-col overflow-x-hidden pb-14 transition-all duration-200 lg:pb-0 ${
          isAiPanelOpen ? "lg:ml-[368px]" : "lg:ml-12"
        }`}
      >
        <NotebookHeader
          notebook={notebook}
          onTitleSaved={refetch}
          setIsSharingDialogOpen={() => setIsSharingDialogOpen(true)}
        />
        <DragDropSortProvider>
          <DragDropScrollArea
            ref={nbContentScrollRef}
            className="w-full min-w-0 flex-1 overflow-y-scroll"
          >
            <div className="px-2 sm:mx-auto sm:px-4 xl:container">
              <NotebookContent />
              <div className="h-[70vh]"></div>
            </div>
          </DragDropScrollArea>
        </DragDropSortProvider>
        {isScrolled && isLargeScreen && (
          <ScrollToTopButton
            onClick={() => nbContentScrollRef.current?.scrollTo({ top: 0 })}
          />
        )}
      </div>

      <SharingDialog
        notebookId={notebook.id}
        isOpen={isSharingDialogOpen}
        onOpenChange={setIsSharingDialogOpen}
      />
    </div>
  );
}

function ScrollToTopButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onClick}
      className="bg-background/50 animate-in fade-in-0 zoom-in-95 absolute right-4 bottom-1.5 z-50 backdrop-blur-xs"
    >
      <ArrowUp className="h-4 w-4" />
    </Button>
  );
}

function NotebookError({
  error,
}: {
  error: { message: string } | null | undefined;
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold text-red-600">
          {error ? "Error Loading Notebook" : "Notebook Not Found"}
        </h1>
        <p className="mb-6 text-gray-600">
          {error
            ? error.message
            : "The notebook you're looking for doesn't exist or you don't have access to it."}
        </p>
        <Link to="/nb">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Notebooks
          </Button>
        </Link>
      </div>
    </div>
  );
}
