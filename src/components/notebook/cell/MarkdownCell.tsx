import { useAddCell } from "@/hooks/useAddCell.js";
import { useCellContent } from "@/hooks/useCellContent.js";
import { useCellKeyboardNavigation } from "@/hooks/useCellKeyboardNavigation.js";
import { useDeleteCell } from "@/hooks/useDeleteCell.js";
import { useDeleteCellsBelow } from "@/hooks/useDeleteCellsBelow.js";
import { useEditorRegistry } from "@/hooks/useEditorRegistry.js";
import { useMoveCell } from "@/hooks/useMoveCell.js";
import { useStore } from "@livestore/react";
import { CellTypeNoRaw, events, queries, tables } from "@runtimed/schema";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { IframeOutput } from "@runtimed/components";
import { Button } from "@/components/ui/button.js";
import { useFeatureFlag } from "@/contexts/FeatureFlagContext.js";
import { useUserRegistry } from "@/hooks/useUserRegistry.js";
import { cn } from "@/lib/utils.js";
import { cycleCellType } from "@/util/cycle-cell-type.js";
import { Edit3, Eye } from "lucide-react";
import { ErrorBoundary } from "react-error-boundary";
import { useClickAway } from "react-use";
import { useAuthenticatedUser } from "../../../auth/index.js";
import { focusedCellSignal$, hasManuallyFocused$ } from "../signals/focus.js";
import { CellContainer } from "./shared/CellContainer.js";
import { CellControls } from "./shared/CellControls.js";
import { CellHeader } from "./shared/CellHeader.js";
import { CellTypeSelector } from "./shared/CellTypeSelector.js";
import { Editor, EditorRef } from "./shared/Editor.js";
import { PresenceBookmarks } from "./shared/PresenceBookmarks.js";
import { Spinner } from "@/components/ui/Spinner.js";

interface MarkdownCellProps {
  cell: typeof tables.cells.Type;
  autoFocus?: boolean;
  contextSelectionMode?: boolean;
  dragHandle?: React.ReactNode;
}

export const MarkdownCell: React.FC<MarkdownCellProps> = ({
  cell,
  autoFocus = false,
  contextSelectionMode = false,
  dragHandle,
}) => {
  const enableSqlCells = useFeatureFlag("enable-sql-cells");

  const editButtonRef = useRef<HTMLButtonElement>(null);
  const cellContainerRef = useRef<HTMLDivElement>(null);

  const [readyToShowRendered, setReadyToShowRendered] = useState(false);

  const { store } = useStore();
  const {
    registerEditor,
    unregisterEditor,
    focusCell: registryFocusCell,
  } = useEditorRegistry();

  const { handleDeleteCell } = useDeleteCell(cell.id);
  const { deleteAllCellsBelow, hasCellsBelow } = useDeleteCellsBelow(cell.id);
  const { addCell } = useAddCell();
  const { moveCellUp, moveCellDown, canMoveUp, canMoveDown } = useMoveCell(
    cell.id
  );
  // Use shared content management hook
  const { localSource, setLocalSource, updateSource, handleSourceChange } =
    useCellContent({
      cellId: cell.id,
      initialSource: cell.source,
    });

  useClickAway(cellContainerRef, () => {
    if (localSource.length > 0) {
      setIsEditing(false);
    }
    updateSource();
  });

  // All hooks must be called at the top level before any conditional returns
  const userId = useAuthenticatedUser();
  const { getUsersOnCell, getUserColor, getUserInfo } = useUserRegistry();
  const [isEditing, setIsEditing] = useState(autoFocus);

  // If another cell causes this one to focus, we need to set the editing state to false
  useEffect(() => {
    setIsEditing(autoFocus);
  }, [autoFocus]);

  // Get users present on this cell (excluding current user)
  const usersOnCell = getUsersOnCell(cell.id).filter(
    (user) => user.id !== userId
  );

  const changeCellType = useCallback(
    (newType: CellTypeNoRaw) => {
      store.commit(
        events.cellTypeChanged({
          id: cell.id,
          cellType: newType,
          actorId: userId,
        })
      );
    },
    [cell.id, store, userId]
  );

  const toggleSourceVisibility = useCallback(() => {
    store.commit(
      events.cellSourceVisibilityToggled({
        id: cell.id,
        sourceVisible: !cell.sourceVisible,
        actorId: userId,
      })
    );
  }, [cell.id, cell.sourceVisible, store, userId]);

  const toggleAiContextVisibility = useCallback(() => {
    store.commit(
      events.cellAiContextVisibilityToggled({
        id: cell.id,
        aiContextVisible: !cell.aiContextVisible,
        actorId: userId,
      })
    );
  }, [cell.id, cell.aiContextVisible, store, userId]);

  const clearCellOutputs = useCallback(async () => {
    store.commit(
      events.cellOutputsCleared({
        cellId: cell.id,
        wait: false,
        clearedBy: userId,
      })
    );
  }, [cell.id, store, userId]);

  // Create navigation handlers using the registry
  const onFocusNext = useCallback(
    (cursorPosition: "start" | "end" = "start") => {
      const cellReferences = store.query(queries.cellsWithIndices$);
      const currentIndex = cellReferences.findIndex((c) => c.id === cell.id);

      if (currentIndex < cellReferences.length - 1) {
        const nextCell = cellReferences[currentIndex + 1];
        store.setSignal(focusedCellSignal$, nextCell.id);
        registryFocusCell(nextCell.id, cursorPosition);
      } else {
        // At the last cell, create a new one with same cell type (but never raw)
        const currentCell = cellReferences[currentIndex];
        const newCellType =
          currentCell.cellType === "raw" ? "code" : currentCell.cellType;
        addCell(cell.id, newCellType);
      }
    },
    [cell.id, store, registryFocusCell, addCell]
  );

  const onFocusPrevious = useCallback(
    (cursorPosition: "start" | "end" = "end") => {
      const cellReferences = store.query(queries.cellsWithIndices$);
      const currentIndex = cellReferences.findIndex((c) => c.id === cell.id);

      if (currentIndex > 0) {
        const previousCell = cellReferences[currentIndex - 1];
        store.setSignal(focusedCellSignal$, previousCell.id);
        registryFocusCell(previousCell.id, cursorPosition);
      }
    },
    [cell.id, store, registryFocusCell]
  );

  // Use shared keyboard navigation hook
  const { keyMap, handleKeyDown } = useCellKeyboardNavigation({
    onFocusNext,
    onFocusPrevious,
    onDeleteCell: () => handleDeleteCell("keyboard"),
    onUpdateSource: updateSource,
    onEmptyCellShiftTab: () =>
      changeCellType(cycleCellType(cell.cellType, enableSqlCells)),
  });

  // Because this is a markdown cell, there's nothing to execute, but we do want to handle the same keybindings as a code cell
  const extendedKeyMap = useMemo(() => {
    return [
      {
        key: "Escape",
        run: () => {
          setLocalSource(cell.source);
          if (cell.source.length > 0) {
            setTimeout(() => {
              setIsEditing(false);
              editButtonRef.current?.focus();
            }, 0);
          }
          return true;
        },
      },
      {
        key: "Mod-Enter",
        run: () => {
          setIsEditing(false);
          updateSource();
          editButtonRef.current?.focus();
          return true;
        },
      },
      ...keyMap,
    ];
  }, [
    cell.source,
    keyMap,
    setLocalSource,
    updateSource,
    editButtonRef,
    setIsEditing,
  ]);

  const handleFocus = useCallback(() => {
    store.setSignal(focusedCellSignal$, cell.id);
    store.setSignal(hasManuallyFocused$, true);

    // Set presence to track user focus on this cell
    store.commit(
      events.presenceSet({
        userId,
        cellId: cell.id,
      })
    );
  }, [store, cell.id, userId]);

  // Handle editor registration for navigation
  const handleEditorReady = useCallback(
    (editorRef: EditorRef) => {
      if (editorRef) {
        registerEditor(cell.id, editorRef);
      }
    },
    [cell.id, registerEditor]
  );

  // Cleanup editor registration on unmount
  React.useEffect(() => {
    return () => {
      unregisterEditor(cell.id);
    };
  }, [cell.id, unregisterEditor]);

  const focusBgColor = "bg-amber-50";
  const focusBorderColor = "border-amber-400";

  const showRenderedOutput = readyToShowRendered && !isEditing;

  return (
    <CellContainer
      ref={cellContainerRef}
      cell={cell}
      autoFocus={autoFocus}
      contextSelectionMode={contextSelectionMode}
      onFocus={handleFocus}
      focusBgColor={focusBgColor}
      focusBorderColor={focusBorderColor}
      className="hover:border-amber-300"
    >
      {/* Cell Header */}
      <CellHeader
        cellId={cell.id}
        onKeyDown={!isEditing ? handleKeyDown : undefined}
        leftContent={
          <>
            {dragHandle}
            <CellTypeSelector cell={cell} onCellTypeChange={changeCellType} />
            {isEditing ? (
              <Button
                variant="outline"
                size="xs"
                className="text-xs"
                ref={editButtonRef}
                onClick={() => setIsEditing(false)}
              >
                <Eye className="size-4" /> Preview
              </Button>
            ) : readyToShowRendered ? (
              <Button
                variant="outline"
                size="xs"
                className="text-xs"
                onClick={() => setIsEditing(true)}
              >
                <Edit3 className="size-4" /> Edit
              </Button>
            ) : (
              <Spinner size="sm" />
            )}

            <PresenceBookmarks
              usersOnCell={usersOnCell}
              getUserColor={getUserColor}
              getUserInfo={getUserInfo}
            />
          </>
        }
        rightContent={
          <CellControls
            sourceVisible={cell.sourceVisible}
            aiContextVisible={cell.aiContextVisible}
            contextSelectionMode={contextSelectionMode}
            onDeleteCell={() => handleDeleteCell("click")}
            onClearOutputs={clearCellOutputs}
            hasOutputs={true}
            toggleSourceVisibility={toggleSourceVisibility}
            toggleAiContextVisibility={toggleAiContextVisibility}
            onMoveUp={moveCellUp}
            onMoveDown={moveCellDown}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onDeleteAllBelow={deleteAllCellsBelow}
            hasCellsBelow={hasCellsBelow}
          />
        }
      />

      {/* Cell Content */}
      <div className="relative">
        <div
          className={cn(
            "cell-content bg-white pr-4 pl-4 transition-colors",
            // Ensure we don't add to parent height if hidden
            showRenderedOutput ? "h-auto py-1" : "h-0 opacity-0"
          )}
        >
          {/* Send markdown content to iframe */}
          <IframeOutput
            iframeUri={import.meta.env.VITE_IFRAME_OUTPUT_URI || ""}
            onDoubleClick={() => setIsEditing(true)}
            onMarkdownRendered={() => setReadyToShowRendered(true)}
            outputs={[
              {
                id: cell.id + "-output",
                cellId: cell.id,
                position: 0,
                streamName: null,
                executionCount: 0,
                representations: {
                  "text/markdown": {
                    type: "inline",
                    data: localSource,
                    metadata: {},
                  },
                },
                metadata: {},
                displayId: null,
                mimeType: "text/markdown",
                artifactId: null,
                data: localSource,
                outputType: "markdown",
              },
            ]}
            isReact
          />
        </div>

        {/* Editor Content Area */}
        <div
          className={cn(
            "cell-content bg-white pl-4 transition-colors",
            // Ensure we don't add to parent height if hidden
            !showRenderedOutput ? "block py-1" : "hidden"
          )}
        >
          <ErrorBoundary fallback={<div>Error rendering editor</div>}>
            <Editor
              ref={handleEditorReady}
              localSource={localSource}
              handleSourceChange={handleSourceChange}
              onBlur={updateSource}
              handleFocus={handleFocus}
              language="markdown"
              placeholder="Write markdown..."
              enableLineWrapping={true}
              autoFocus={autoFocus}
              keyMap={extendedKeyMap}
            />
          </ErrorBoundary>
        </div>
      </div>
    </CellContainer>
  );
};
