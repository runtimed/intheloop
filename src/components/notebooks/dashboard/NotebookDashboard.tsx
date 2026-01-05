import { useDebug } from "@/components/debug/debug-mode";
import { DebugModeToggle } from "@/components/debug/DebugModeToggle";
import { LoadingState } from "@/components/loading/LoadingState";
import { RuntLogoSmall } from "@/components/logo/RuntLogoSmall";

import { SimpleUserProfile } from "@/components/notebooks/SimpleUserProfile";
import { TagActions } from "@/components/notebooks/TagActions";
import { TagBadge } from "@/components/notebooks/TagBadge";
import { TagCreationDialog } from "@/components/notebooks/TagCreationDialog";
import { NotebookProcessed } from "@/components/notebooks/types";
import { useTrpc } from "@/components/TrpcProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNotebooks } from "@/hooks/use-notebooks";
import { trpcQueryClient, tagQueryDefaults } from "@/lib/trpc-client";
import { useQuery } from "@tanstack/react-query";
import { Grid3X3, List, Plus, Search, User, Users } from "lucide-react";
import React, { useMemo, useEffect } from "react";
import {
  useCreateNotebookAndNavigate,
  useDashboardParams,
  useSmartDefaultFilter,
} from "./helpers";
import { NoResults, Results } from "./Results";
import { useTitle } from "react-use";

const DebugNotebooks = React.lazy(() =>
  import("./DebugNotebooks").then((mod) => ({ default: mod.DebugNotebooks }))
);

export const NotebookDashboard: React.FC = () => {
  const debug = useDebug();
  const trpc = useTrpc();

  useTitle("Notebooks Dashboard");

  const { activeFilter, searchQuery, selectedTagName } = useDashboardParams();
  const {
    allNotebooks,
    filteredNotebooks,
    namedNotebooks,
    isLoading,
    error,
    refetch,
  } = useNotebooks(selectedTagName, activeFilter, searchQuery);

  useSmartDefaultFilter({ allNotebooks });

  // Cache warming: prefetch related queries when dashboard loads
  useEffect(() => {
    // Prefetch user data if not already cached
    trpcQueryClient.prefetchQuery({
      ...trpc.me.queryOptions(),
      ...tagQueryDefaults,
    });
  }, [trpc.me]);

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-red-600">
            Error Loading Notebooks
          </h1>
          <p className="text-gray-600">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-64 overflow-y-auto border-r border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-200 p-4">
          <RuntLogoSmall />
          <h2 className="font-semibold text-gray-900">Notebooks</h2>
        </div>
        <Filters allNotebooks={allNotebooks} />
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-gray-200 bg-white p-4">
          <TopHeader />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6">
          {debug.enabled && <DebugNotebooks notebooks={filteredNotebooks} />}
          {isLoading && <LoadingState message="Loading notebooks..." />}

          {!isLoading && filteredNotebooks.length === 0 && <NoResults />}

          {!isLoading && filteredNotebooks.length > 0 && (
            <Results
              refetch={refetch}
              namedNotebooks={namedNotebooks}
              filteredNotebooks={filteredNotebooks}
            />
          )}
        </div>
      </div>
    </div>
  );
};

function Filters({ allNotebooks }: { allNotebooks: NotebookProcessed[] }) {
  const { activeFilter, selectedTagName, setActiveFilter, setSelectedTag } =
    useDashboardParams();

  const trpc = useTrpc();
  const { data: tagsData } = useQuery({
    ...trpc.tags.queryOptions(),
    ...tagQueryDefaults,
  });

  // Memoize tag counts to prevent recalculation on every render
  const tagCounts = useMemo(() => {
    if (!tagsData || !allNotebooks) return {};
    return tagsData.reduce(
      (counts, tag) => {
        counts[tag.id] = allNotebooks.filter((n) =>
          n.tags?.some((t) => t.id === tag.id)
        ).length;
        return counts;
      },
      {} as Record<string, number>
    );
  }, [tagsData, allNotebooks]);

  if (!tagsData) {
    return <LoadingState message="Loading tags..." />;
  }

  return (
    <div className="space-y-6 p-4">
      {/* Navigation */}
      <nav className="space-y-1">
        <button
          onClick={() => setActiveFilter("named")}
          className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
            activeFilter === "named"
              ? "border border-blue-200 bg-blue-50 text-blue-700"
              : "border border-transparent text-gray-700 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center">
            <User className="mr-3 h-4 w-4" />
            My Notebooks
          </div>
          <Badge
            variant="secondary"
            className="bg-gray-100 text-xs text-gray-600"
          >
            {
              allNotebooks.filter(
                (n) =>
                  n.myPermission === "OWNER" &&
                  n.title &&
                  !n.title.startsWith("Untitled")
              ).length
            }
          </Badge>
        </button>

        <button
          onClick={() => setActiveFilter("scratch")}
          className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
            activeFilter === "scratch"
              ? "border border-blue-200 bg-blue-50 text-blue-700"
              : "border border-transparent text-gray-700 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center">
            <Users className="mr-3 h-4 w-4" />
            Scratch
          </div>
          <Badge
            variant="secondary"
            className="bg-gray-100 text-xs text-gray-600"
          >
            {
              allNotebooks.filter(
                (n) =>
                  n.myPermission === "OWNER" &&
                  (!n.title || n.title.startsWith("Untitled"))
              ).length
            }
          </Badge>
        </button>

        <button
          onClick={() => setActiveFilter("shared")}
          className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
            activeFilter === "shared"
              ? "border border-blue-200 bg-blue-50 text-blue-700"
              : "border border-transparent text-gray-700 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center">
            <Users className="mr-3 h-4 w-4" />
            Shared with Me
          </div>
          <Badge
            variant="secondary"
            className="bg-gray-100 text-xs text-gray-600"
          >
            {allNotebooks.filter((n) => n.myPermission === "WRITER").length}
          </Badge>
        </button>
      </nav>

      {/* Tags Section */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            Filter by Tags
          </h3>
          {selectedTagName && (
            <button
              onClick={() => setSelectedTag("")}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Clear
            </button>
          )}
        </div>

        <div className="space-y-1">
          {tagsData && tagsData.length > 0 ? (
            tagsData.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between rounded-lg px-3 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <button
                  className={`flex min-w-0 flex-1 items-center gap-2 py-1 ${
                    selectedTagName === tag.name
                      ? "text-blue-700"
                      : "text-gray-700"
                  }`}
                  onClick={() =>
                    setSelectedTag(selectedTagName === tag.name ? "" : tag.name)
                  }
                >
                  <TagBadge tag={tag} className="flex-shrink-0" />
                  {selectedTagName === tag.name && (
                    <div className="ml-1 h-2 w-2 rounded-full bg-blue-500" />
                  )}
                </button>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <Badge variant="secondary" className="ml-2">
                    {tagCounts[tag.id] || 0}
                  </Badge>
                  <TagActions tag={tag} />
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-sm text-gray-500">
              No tags yet
            </div>
          )}
        </div>

        {/* Add Tag Button */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <TagCreationDialog
            onTagCreated={() => {
              trpcQueryClient.invalidateQueries({
                queryKey: trpc.tags.queryKey(),
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ---

export function TopHeader() {
  const { viewMode, setViewMode } = useDashboardParams();
  const createNotebook = useCreateNotebookAndNavigate();

  return (
    <div className="flex items-center justify-between gap-4">
      {/* Search */}
      <SearchInput />

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* View Toggle */}
        <div className="flex items-center rounded-md border">
          <button
            onClick={() => setViewMode("grid")}
            className={`rounded-l-md p-2 transition-colors ${
              viewMode === "grid"
                ? "bg-blue-50 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`rounded-r-md p-2 transition-colors ${
              viewMode === "table"
                ? "bg-blue-50 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        {/* New Notebook Button */}
        <Button onClick={() => createNotebook()}>
          <Plus className="mr-2 h-4 w-4" />
          New Notebook
        </Button>

        {/* Debug Mode Toggle */}
        {import.meta.env.DEV && <DebugModeToggle />}

        {/* User Profile */}
        <SimpleUserProfile />
      </div>
    </div>
  );
}

function SearchInput() {
  const { searchQuery, setSearchQuery } = useDashboardParams();

  return (
    <div className="relative max-w-2xl flex-1">
      <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
      <Input
        type="text"
        placeholder="Search notebooks..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="pl-10"
      />
    </div>
  );
}
