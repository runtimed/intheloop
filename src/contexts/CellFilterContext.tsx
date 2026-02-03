import React, { createContext, useContext, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

interface CellFilters {
  showAiCells: boolean;
  showCodeCells: boolean;
}

const DEFAULT_FILTERS: CellFilters = {
  showAiCells: true,
  showCodeCells: true,
} as const;

interface CellFilterContextType {
  filters: CellFilters;
  setShowAiCells: (value: boolean) => void;
  setShowCodeCells: (value: boolean) => void;
}

const CellFilterContext = createContext<CellFilterContextType | undefined>(
  undefined
);

interface CellFilterProviderProps {
  children: React.ReactNode;
}

export function CellFilterProvider({ children }: CellFilterProviderProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse filter values from URL query params, defaulting to true if not present
  const filters = useMemo<CellFilters>(() => {
    const showAiCellsParam = searchParams.get("showAiCells");
    const showCodeCellsParam = searchParams.get("showCodeCells");

    return {
      showAiCells:
        showAiCellsParam === null
          ? DEFAULT_FILTERS.showAiCells
          : showAiCellsParam === "true",
      showCodeCells:
        showCodeCellsParam === null
          ? DEFAULT_FILTERS.showCodeCells
          : showCodeCellsParam === "true",
    };
  }, [searchParams]);

  const setShowAiCells = React.useCallback(
    (value: boolean) => {
      const newSearchParams = new URLSearchParams(searchParams);
      if (value === DEFAULT_FILTERS.showAiCells) {
        // Remove param if it matches default
        newSearchParams.delete("showAiCells");
      } else {
        newSearchParams.set("showAiCells", String(value));
      }
      setSearchParams(newSearchParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const setShowCodeCells = React.useCallback(
    (value: boolean) => {
      const newSearchParams = new URLSearchParams(searchParams);
      if (value === DEFAULT_FILTERS.showCodeCells) {
        // Remove param if it matches default
        newSearchParams.delete("showCodeCells");
      } else {
        newSearchParams.set("showCodeCells", String(value));
      }
      setSearchParams(newSearchParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  return (
    <CellFilterContext.Provider
      value={{ filters, setShowAiCells, setShowCodeCells }}
    >
      {children}
    </CellFilterContext.Provider>
  );
}

export function useCellFilter() {
  const context = useContext(CellFilterContext);

  if (context === undefined) {
    throw new Error("useCellFilter must be used within a CellFilterProvider");
  }

  return context;
}
