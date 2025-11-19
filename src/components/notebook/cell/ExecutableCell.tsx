import { useAuthenticatedUser } from "@/auth/index.js";
import { Button } from "@/components/ui/button";
import { useCellContent } from "@/hooks/useCellContent.js";
import { useCellKeyboardNavigation } from "@/hooks/useCellKeyboardNavigation.js";
import { useCellOutputs } from "@/hooks/useCellOutputs.js";
import { useInterruptExecution } from "@/hooks/useInterruptExecution.js";
import { useUserRegistry } from "@/hooks/useUserRegistry.js";
import { useEditorRegistry } from "@/hooks/useEditorRegistry.js";
import { useDeleteCell } from "@/hooks/useDeleteCell.js";
import { useDeleteCellsBelow } from "@/hooks/useDeleteCellsBelow.js";
import { useAddCell } from "@/hooks/useAddCell.js";
import { useMoveCell } from "@/hooks/useMoveCell.js";
import { useActiveRuntime } from "@/hooks/useRuntimeHealth.js";
import { useAutoLaunchRuntime } from "@/hooks/useAutoLaunchRuntime.js";
import { useDetectedRuntimeType } from "@/hooks/useNotebookRuntimeType.js";

import { useStore } from "@livestore/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { focusedCellSignal$, hasManuallyFocused$ } from "../signals/focus.js";
import { events, tables, queries, CellTypeNoRaw } from "@runtimed/schema";
import { ChevronDown, ChevronUp } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { CellContainer } from "./shared/CellContainer.js";
import { CellControls } from "./shared/CellControls.js";
import { CellHeader } from "./shared/CellHeader.js";
import { CellTypeSelector } from "./shared/CellTypeSelector.js";
import { Editor, EditorRef } from "./shared/Editor.js";
import {
  languageFromCellType,
  placeholderFromCellType,
  shouldEnableLineWrapping,
} from "./shared/editorUtils.js";
import { ExecutionStatus } from "./shared/ExecutionStatus.js";
import { OutputsErrorBoundary } from "./shared/OutputsErrorBoundary.js";
import { PlayButton } from "./shared/PlayButton.js";
import { PresenceBookmarks } from "./shared/PresenceBookmarks.js";

// Import toolbars
import { AiToolbar } from "./toolbars/AiToolbar.js";
import { CodeToolbar } from "./toolbars/CodeToolbar.js";
import { SqlToolbar } from "./toolbars/SqlToolbar.js";

import { MaybeCellOutputs } from "@/components/outputs/MaybeCellOutputs.js";
import { useToolApprovals } from "@/hooks/useToolApprovals.js";
import { AiToolApprovalOutput } from "../../outputs/shared-with-iframe/AiToolApprovalOutput.js";
import { cn } from "@/lib/utils.js";
import { generateQueueId } from "@/util/queue-id.js";
import { useTrpc } from "@/components/TrpcProvider.js";
import { cycleCellType } from "@/util/cycle-cell-type.js";
import { useFeatureFlag } from "@/contexts/FeatureFlagContext.js";
import { findBestAiModelForCell } from "./toolbars/ai-model-utils.js";
import { useAvailableAiModels } from "@/util/ai-models.js";
import { toast } from "sonner";
import { useCellFilter } from "@/contexts/CellFilterContext.js";

// Cell-specific styling configuration
const getCellStyling = (cellType: "code" | "sql" | "ai") => {
  switch (cellType) {
    case "sql":
      return {
        focusBgColor: "bg-blue-100",
        focusBorderColor: "border-blue-700",
      };
    case "ai":
      return {
        focusBgColor: "bg-purple-50",
        focusBorderColor: "border-purple-700",
      };
    default: // code
      return {
        focusBgColor: "bg-gray-100",
        focusBorderColor: "border-black",
      };
  }
};

interface ExecutableCellProps {
  cell: typeof tables.cells.Type;
  autoFocus?: boolean;
  contextSelectionMode?: boolean;
  dragHandle?: React.ReactNode;
}

export const ExecutableCell: React.FC<ExecutableCellProps> = ({
  cell,
  autoFocus = false,
  contextSelectionMode = false,
  dragHandle,
}) => {
  const { models: availableModels } = useAvailableAiModels();
  const userSavedPromptEnabled = useFeatureFlag("user-saved-prompt");
  const enableSqlCells = useFeatureFlag("enable-sql-cells");

  const trpc = useTrpc();
  const { store } = useStore();

  const { data: savedPrompt } = useTanstackQuery({
    ...trpc.getSavedPrompt.queryOptions(),
    enabled: userSavedPromptEnabled && autoFocus && cell.cellType === "ai",
  });

  const hasRunRef = useRef(false);
  const cellRef = useRef<HTMLDivElement>(null);

  const {
    filters: { showCodeCells },
  } = useCellFilter();

  const {
    registerEditor,
    unregisterEditor,
    focusCell: registryFocusCell,
  } = useEditorRegistry();

  // TODO: ideally, we'd not be tracking state in the cell component, but in the toolbar component
  const [openAiToolbar, setOpenAiToolbar] = useState(false);

  const { handleDeleteCell } = useDeleteCell(cell.id);
  const { deleteAllCellsBelow, hasCellsBelow } = useDeleteCellsBelow(cell.id);
  const { addCell } = useAddCell();
  const {
    moveCellUp,
    moveCellDown,
    moveCellToTop,
    moveCellToBottom,
    canMoveUp,
    canMoveDown,
  } = useMoveCell(cell.id);

  const userId = useAuthenticatedUser();
  const { getUsersOnCell, getUserColor, getUserInfo } = useUserRegistry();
  const activeRuntime = useActiveRuntime();
  const detectedRuntimeType = useDetectedRuntimeType();
  const { ensureRuntime, status: autoLaunchStatus } = useAutoLaunchRuntime({
    runtimeType: detectedRuntimeType,
  });

  // Get users present on this cell (excluding current user)
  const usersOnCell = getUsersOnCell(cell.id).filter(
    (user) => user.id !== userId
  );

  // Use shared content management hook
  const { localSource, updateSource, handleSourceChange } = useCellContent({
    cellId: cell.id,
    initialSource: cell.source,
  });

  // Use shared outputs hook with cell-type-specific configuration
  const { outputs, hasOutputs, staleOutputs, setStaleOutputs } = useCellOutputs(
    cell.id
  );

  // Clear stale outputs when cell is completed or in error state
  useEffect(() => {
    if (
      cell.executionState === "completed" ||
      cell.executionState === "error"
    ) {
      setStaleOutputs([]);
    }
  }, [cell.executionState, setStaleOutputs]);

  // Shared event handlers
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

  const toggleOutputVisibility = useCallback(() => {
    store.commit(
      events.cellOutputVisibilityToggled({
        id: cell.id,
        outputVisible: !cell.outputVisible,
        actorId: userId,
      })
    );
  }, [cell.id, cell.outputVisible, store, userId]);

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
    if (hasOutputs) {
      store.commit(
        events.cellOutputsCleared({
          cellId: cell.id,
          wait: false,
          clearedBy: userId,
        })
      );
    }
  }, [cell.id, store, hasOutputs, userId]);

  const selectModel = useCallback(
    (provider: string, model: string) => {
      registryFocusCell(cell.id, "end");
      store.commit(
        ...[
          events.aiSettingsChanged({
            cellId: cell.id,
            provider: provider,
            model: model,
            settings: {
              temperature: 0.7,
              maxTokens: 1000,
            },
          }),
          // Save the last used AI model to notebook metadata for future AI cells
          events.notebookMetadataSet({
            key: "lastUsedAiProvider",
            value: provider,
          }),
          events.notebookMetadataSet({
            key: "lastUsedAiModel",
            value: model,
          }),
        ]
      );
    },
    [cell.id, registryFocusCell, store]
  );

  // Execution handler for all executable cell types
  const executeCell = useCallback(async (): Promise<void> => {
    // Use localSource instead of cell.source to get the current typed content
    const sourceToExecute = localSource || cell.source;
    if (!sourceToExecute?.trim()) {
      return;
    }

    // Ensure runtime is available before execution
    console.log("🔍 Ensuring runtime is available for execution...");
    const runtimeAvailable = await ensureRuntime();

    if (!runtimeAvailable) {
      console.warn(
        "⚠️ Could not launch runtime automatically. User may need to start runtime manually."
      );
      // Still proceed with execution - the runtime might become available
      // or the user might have an external runtime running
    }

    try {
      // Save old outputs to be shown while new ones are being generated
      setStaleOutputs(outputs);

      if (userSavedPromptEnabled) {
        store.commit(
          events.notebookMetadataSet({
            key: "user_saved_prompt",
            value: savedPrompt?.prompt || "",
          })
        );
      }

      if (cell.cellType === "ai") {
        if (!runtimeAvailable || !activeRuntime) {
          // TODO: properly handle this case by waiting for runtime to launch and then retrying execution
          toast.error("Wait for runtime to launch, then retry execution...");
          return;
        }
        const bestModel = findBestAiModelForCell(
          store,
          { provider: cell.aiProvider, model: cell.aiModel },
          availableModels
        );

        if (bestModel) {
          selectModel(bestModel.provider, bestModel.name);
        } else {
          toast.error("No AI model found");
          return;
        }
      }

      // Clear previous outputs before generating new ones
      store.commit(
        events.cellOutputsCleared({
          cellId: cell.id,
          wait: false,
          clearedBy: userId,
        })
      );

      // Generate unique queue ID
      const executionCount = (cell.executionCount || 0) + 1;

      // Add to execution queue - runtimes will pick this up
      store.commit(
        events.executionRequested({
          queueId: generateQueueId(),
          cellId: cell.id,
          executionCount,
          requestedBy: userId,
        })
      );
      hasRunRef.current = true;
    } catch (error) {
      // Store error information directly
      store.commit(
        events.errorOutputAdded({
          id: `error-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          cellId: cell.id,
          position: 0,
          content: {
            type: "inline",
            data: {
              ename: "ExecutionError",
              evalue:
                error instanceof Error
                  ? error.message
                  : "Failed to queue execution request",
              traceback: ["Error occurred while emitting LiveStore event"],
            },
          },
        })
      );
    }
  }, [
    localSource,
    cell.source,
    cell.cellType,
    cell.id,
    cell.executionCount,
    cell.aiProvider,
    cell.aiModel,
    ensureRuntime,
    setStaleOutputs,
    outputs,
    userSavedPromptEnabled,
    store,
    userId,
    savedPrompt?.prompt,
    availableModels,
    selectModel,
    activeRuntime,
  ]);

  const { interruptExecution: interruptCell } = useInterruptExecution({
    cellId: cell.id,
    userId,
    reason: "User interrupted execution",
  });

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

  // Use shared keyboard navigation hook with cell-type-specific execution
  const { keyMap } = useCellKeyboardNavigation({
    onFocusNext,
    onFocusPrevious,
    onDeleteCell: () => handleDeleteCell("keyboard"),
    onExecute: executeCell,
    onOpenAiToolbar: () => setOpenAiToolbar(true),
    onUpdateSource: updateSource,
    onEmptyCellShiftTab: () =>
      changeCellType(cycleCellType(cell.cellType, enableSqlCells)),
  });

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

  const { focusBgColor, focusBorderColor } = getCellStyling(
    cell.cellType as "code" | "sql" | "ai"
  );

  // All these conditions because a user can have a source-less AI cell by making one manually and then deleting the source
  // Not checking for metadata for chat mode because if the user is not in chat mode, we could still receive
  // AI outputs interspersed with other cell outputs.
  const isSourceLessAiOutput =
    cell.cellType === "ai" &&
    cell.source === "" &&
    cell.createdBy.startsWith("ai-");

  const showOutput =
    cell.outputVisible &&
    (hasOutputs ||
      cell.executionState === "running" ||
      staleOutputs.length > 0);

  const cellTypeClassName = cn(
    cell.cellType === "code" && "hover:border-gray-500",
    cell.cellType === "ai" && "hover:border-purple-500",
    cell.cellType === "sql" && "hover:border-blue-500"
  );

  return (
    <CellContainer
      ref={cellRef}
      cell={cell}
      autoFocus={autoFocus}
      contextSelectionMode={contextSelectionMode}
      className={cellTypeClassName}
      onFocus={handleFocus}
      focusBgColor={focusBgColor}
      focusBorderColor={focusBorderColor}
    >
      {/* Cell Header */}
      {!isSourceLessAiOutput && showCodeCells && (
        <CellHeader
          cellId={cell.id}
          leftContent={
            <>
              {dragHandle}
              <CellTypeSelector cell={cell} onCellTypeChange={changeCellType} />

              {/* Cell-type-specific toolbars */}
              {cell.cellType === "code" && <CodeToolbar />}
              {/* Not showing AI toolbar if not focused because the model selector depends on the last used model and cell information */}
              {cell.cellType === "ai" && autoFocus && (
                <AiToolbar
                  open={openAiToolbar}
                  onOpenChange={setOpenAiToolbar}
                  cellProvider={cell.aiProvider}
                  cellModel={cell.aiModel}
                  onModelChange={selectModel}
                />
              )}
              {cell.cellType === "sql" && (
                <SqlToolbar
                  dataConnection={cell.sqlConnectionId || "default"}
                  onDataConnectionChange={(newConnectionId: string) => {
                    store.commit(
                      events.sqlConnectionChanged({
                        cellId: cell.id,
                        connectionId: newConnectionId,
                        changedBy: userId,
                      })
                    );

                    // Save the last used SQL connection to notebook metadata for future SQL cells
                    store.commit(
                      events.notebookMetadataSet({
                        key: "lastUsedSqlConnection",
                        value: newConnectionId,
                      })
                    );
                  }}
                />
              )}

              <ExecutionStatus executionState={cell.executionState} />
              <ErrorBoundary FallbackComponent={() => null}>
                <PresenceBookmarks
                  usersOnCell={usersOnCell}
                  getUserColor={getUserColor}
                  getUserInfo={getUserInfo}
                />
              </ErrorBoundary>
            </>
          }
          rightContent={
            <CellControls
              sourceVisible={cell.sourceVisible}
              aiContextVisible={cell.aiContextVisible}
              contextSelectionMode={contextSelectionMode}
              onDeleteCell={() => handleDeleteCell("click")}
              onClearOutputs={clearCellOutputs}
              hasOutputs={hasOutputs}
              toggleSourceVisibility={toggleSourceVisibility}
              toggleAiContextVisibility={toggleAiContextVisibility}
              onMoveUp={moveCellUp}
              onMoveDown={moveCellDown}
              onMoveToTop={moveCellToTop}
              onMoveToBottom={moveCellToBottom}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              onDeleteAllBelow={deleteAllCellsBelow}
              hasCellsBelow={hasCellsBelow}
              playButton={
                <PlayButton
                  executionState={cell.executionState}
                  cellType={cell.cellType}
                  isFocused={autoFocus}
                  onExecute={executeCell}
                  onInterrupt={interruptCell}
                  className="mobile-play-btn block sm:hidden"
                  isAutoLaunching={autoLaunchStatus.isLaunching}
                />
              }
            />
          }
        />
      )}

      {/* Cell Content with Left Gutter Play Button - Desktop Only */}
      {!isSourceLessAiOutput && showCodeCells && (
        <div className="relative">
          {/* Play Button Breaking Through Left Border - Desktop Only */}
          <div
            className="absolute z-20 hidden -translate-x-1/2 sm:block"
            style={{
              top: cell.sourceVisible ? "0.35rem" : "-2.1rem",
            }}
          >
            <PlayButton
              executionState={cell.executionState}
              cellType={cell.cellType}
              isFocused={autoFocus}
              onExecute={executeCell}
              onInterrupt={interruptCell}
              className="desktop-play-btn"
              focusedClass={
                cell.cellType === "ai" ? "text-purple-600" : undefined
              }
              isAutoLaunching={autoLaunchStatus.isLaunching}
            />
          </div>

          {/* AI Tool Approval (if any) */}
          {cell.cellType === "ai" && (
            <MaybeInlineToolApproval cellId={cell.id} />
          )}

          {/* Editor Content Area */}
          {cell.sourceVisible && showCodeCells && (
            <div className="cell-content max-w-full overflow-x-auto bg-white py-1 pl-4 transition-colors">
              <ErrorBoundary fallback={<div>Error rendering editor</div>}>
                <Editor
                  ref={handleEditorReady}
                  localSource={localSource}
                  handleSourceChange={handleSourceChange}
                  onBlur={updateSource}
                  handleFocus={handleFocus}
                  language={languageFromCellType(
                    cell.cellType,
                    activeRuntime?.runtimeType
                  )}
                  placeholder={placeholderFromCellType(
                    cell.cellType,
                    activeRuntime?.runtimeType
                  )}
                  enableLineWrapping={shouldEnableLineWrapping(cell.cellType)}
                  autoFocus={autoFocus}
                  keyMap={keyMap}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>
      )}

      {/* Execution Summary - appears after input */}
      {(cell.executionCount ||
        cell.executionState === "running" ||
        cell.executionState === "queued") &&
        showCodeCells && (
          <div className="cell-content flex h-7 items-center justify-stretch pr-1 pl-6 sm:pr-4">
            <div
              className={cn(
                "text-muted-foreground flex w-full items-center justify-between text-xs"
              )}
            >
              <span
                key={cell.executionCount}
                className="animate-in fade-in duration-300 ease-in-out"
              >
                {cell.executionState === "running"
                  ? "Executing..."
                  : cell.executionState === "queued"
                    ? // Show count in case runtime is not responsive, to show that at least something is happening
                      `Queued for execution (execution count: ${cell.executionCount})`
                    : cell.executionCount
                      ? cell.lastExecutionDurationMs
                        ? `Executed in ${
                            cell.lastExecutionDurationMs < 1000
                              ? `${cell.lastExecutionDurationMs}ms`
                              : `${(cell.lastExecutionDurationMs / 1000).toFixed(1)}s`
                          }`
                        : "Executed"
                      : null}
              </span>
              {(outputs.length > 0 || cell.executionState === "running") && (
                <div className="flex items-center gap-2">
                  {!cell.outputVisible && hasOutputs && (
                    <span className="text-muted-foreground text-xs">
                      {outputs.length === 1
                        ? "1 result hidden"
                        : `${outputs.length} results hidden`}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleOutputVisibility}
                    className={`hover:bg-muted/80 h-6 w-6 p-0 transition-opacity sm:h-5 sm:w-5 ${
                      autoFocus
                        ? "opacity-100"
                        : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    } ${cell.outputVisible ? "" : "text-muted-foreground/60"}`}
                    title={cell.outputVisible ? "Hide results" : "Show results"}
                  >
                    {cell.outputVisible ? (
                      <ChevronUp className="h-4 w-4 sm:h-3 sm:w-3" />
                    ) : (
                      <ChevronDown className="h-4 w-4 sm:h-3 sm:w-3" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Output Area */}

      <ErrorBoundary FallbackComponent={OutputsErrorBoundary}>
        <MaybeCellOutputs
          cellId={cell.id}
          cellType={cell.cellType}
          isLoading={cell.executionState === "running" && !hasOutputs}
          outputs={hasOutputs ? outputs : staleOutputs}
          showOutput={showOutput}
        />
      </ErrorBoundary>
    </CellContainer>
  );
};

// AI Tool Approval Component
const MaybeInlineToolApproval: React.FC<{
  cellId: string;
}> = ({ cellId }) => {
  const { currentApprovalRequest, respondToApproval } = useToolApprovals({
    cellId,
  });

  if (!currentApprovalRequest) {
    return null;
  }

  const handleApproval = (
    status: "approved_once" | "approved_always" | "denied"
  ) => {
    respondToApproval(currentApprovalRequest.toolCallId, status);
  };

  return (
    <div className="cell-content pr-1 pl-6 sm:pr-4">
      <AiToolApprovalOutput
        toolCallId={currentApprovalRequest.toolCallId}
        toolName={currentApprovalRequest.toolName}
        onApprove={handleApproval}
      />
    </div>
  );
};
