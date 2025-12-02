import { useQuery, useStore } from "@livestore/react";
import { CellData, queries } from "@runtimed/schema";
import React from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Cell } from "./cell/Cell.js";
import { CellAdder } from "./cell/CellAdder";
import { CellBetweener } from "./cell/CellBetweener.js";
import { EmptyStateCellAdder } from "./EmptyStateCellAdder";
import { contextSelectionMode$ } from "./signals/ai-context.js";
import { focusedCellSignal$, hasManuallyFocused$ } from "./signals/focus.js";
import { GripVerticalIcon } from "lucide-react";
import { useDragDropCellSort } from "@/hooks/useDragDropCellSort";
import { useCellFilter } from "@/contexts/CellFilterContext.js";

export const NotebookContent = () => {
  const { store } = useStore();
  const allCells = useQuery(queries.cells$);
  const { filters } = useCellFilter();

  // Filter cells based on context values
  const cells = React.useMemo(() => {
    return allCells.filter((cell) => {
      // if (cell.cellType === "code" && !filters.showCodeCells) {
      //   return false;
      // }
      if (cell.cellType === "ai" && !filters.showAiCells) {
        return false;
      }
      return true;
    });
  }, [allCells, filters]);

  const focusedCellId = useQuery(focusedCellSignal$);
  const hasManuallyFocused = useQuery(hasManuallyFocused$);

  // Reset focus when focused cell changes or is removed
  React.useEffect(() => {
    if (focusedCellId && !cells.find((c) => c.id === focusedCellId)) {
      store.setSignal(focusedCellSignal$, null);
    }
  }, [focusedCellId, cells, store]);

  // Focus first cell when notebook loads and has cells (but not after deletion)
  React.useEffect(() => {
    if (!focusedCellId && cells.length > 0 && !hasManuallyFocused) {
      store.setSignal(focusedCellSignal$, cells[0].id);
      store.setSignal(hasManuallyFocused$, true);
    }
  }, [focusedCellId, cells, store, hasManuallyFocused]);

  return (
    <>
      {cells.length === 0 ? (
        <EmptyStateCellAdder />
      ) : (
        <>
          <ErrorBoundary fallback={<div>Error rendering cell list</div>}>
            <CellList cells={cells} />
          </ErrorBoundary>
          {/* Add Cell Buttons */}

          <div className="border-border/50 sticky bottom-0 z-20 mt-6 border-t bg-white p-2 px-4 sm:mt-8 sm:px-0">
            <CellAdder position="after" />
          </div>
          <div className="text-muted-foreground hidden text-center text-xs sm:block">
            Add a new cell
          </div>
        </>
      )}
    </>
  );
};

interface CellListProps {
  cells: readonly CellData[];
}

export const CellList: React.FC<CellListProps> = ({ cells }) => {
  return (
    <div style={{ paddingLeft: "1rem" }}>
      <DragDropCellList cells={cells} />
    </div>
  );
};

function DragDropCellList({ cells }: { cells: readonly CellData[] }) {
  const focusedCellId = useQuery(focusedCellSignal$);
  const contextSelectionMode = useQuery(contextSelectionMode$);

  const { draggingOverCell, draggingOverPosition, draggingCellId } =
    useDragDropCellSort();

  return cells.map((cell, index) => (
    <div key={cell.id}>
      <ErrorBoundary fallback={<div>Error rendering cell</div>}>
        {index === 0 && (
          <CellBetweener
            isDraggingOver={
              draggingOverCell === cell.id &&
              draggingOverPosition === "before" &&
              draggingCellId !== cell.id
            }
            cell={cell}
            position="before"
          />
        )}
        <Cell
          cell={cell}
          isFocused={cell.id === focusedCellId}
          contextSelectionMode={contextSelectionMode}
          dragHandle={
            <div className="flex w-6 cursor-grab items-center justify-center transition-colors">
              <GripVerticalIcon className="text-muted-foreground h-4 w-4" />
            </div>
          }
        />
        <CellBetweener
          isDraggingOver={
            (index < cells.length - 1 &&
              draggingOverCell === cells[index + 1].id &&
              draggingOverPosition === "before") ||
            (draggingOverCell === cell.id && draggingOverPosition === "after")
            // TODO: hide when dragging results in a move to the same cell
          }
          cell={cell}
          position="after"
        />
      </ErrorBoundary>
    </div>
  ));
}
