import { AuthGuard } from "@/auth/AuthGuard";
import { AuthProvider } from "@/auth/AuthProvider";
import { AuthAwareAIProvider } from "@/runtime/AuthAwareAIProvider";
import { FPSMeter } from "@/components/debug/FPSMeter.tsx";
import { LoadingState } from "@/components/loading/LoadingState.js";
import { Toaster } from "@/components/ui/sonner.js";
import AuthorizePage from "@/pages/AuthorizePage.tsx";
import {
  isLoadingScreenVisible,
  removeStaticLoadingScreen,
} from "@/util/domUpdates.js";
import React, { Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

// Import page components

// import {NotebookPage as NotebookPageComponent} from "@/pages/NotebookPage.tsx";
const NotebookPage = React.lazy(() =>
  import("@/pages/NotebookPage.tsx").then((mod) => ({
    default: mod.NotebookPage,
  }))
);
const NotebooksDashboardPage = React.lazy(() =>
  import("@/pages/NotebooksDashboardPage.tsx").then((mod) => ({
    default: mod.NotebooksDashboardPage,
  }))
);
const OidcCallbackPage = React.lazy(() =>
  import("@/pages/OidcCallbackPage.tsx").then((mod) => ({
    default: mod.default,
  }))
);
const ErrorFallbackPage = React.lazy(() =>
  import("./components/ErrorFallbackPage").then((mod) => ({
    default: mod.ErrorFallbackPage,
  }))
);
const GeoJsonDemoPage = React.lazy(() =>
  import("./pages/demo/geojson/GeoJsonDemoPage").then((mod) => ({
    default: mod.GeoJsonDemoPage,
  }))
);
const ReorderDemoPage = React.lazy(() =>
  import("./pages/ReorderDemoPage").then((mod) => ({
    default: mod.ReorderDemoPage,
  }))
);
const TrpcDemoPage = React.lazy(() =>
  import("./pages/TrpcDemoPage").then((mod) => ({
    default: mod.TrpcDemoPage,
  }))
);
const FeatureFlagsPage = React.lazy(() =>
  import("./pages/FeatureFlagsPage").then((mod) => ({
    default: mod.FeatureFlagsPage,
  }))
);
const HealthPage = React.lazy(() =>
  import("./pages/HealthPage").then((mod) => ({
    default: mod.HealthPage,
  }))
);

import { ErrorBoundary } from "react-error-boundary";
import { Confirmer, ConfirmProvider } from "./components/ui/confirm";

export const App: React.FC = () => {
  // Safety net: Auto-remove loading screen if no component has handled it
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (isLoadingScreenVisible()) {
        // Check if React has rendered content
        const rootElement = document.getElementById("react-app");
        const hasContent = rootElement && rootElement.children.length > 0;

        if (hasContent) {
          console.warn("Loading screen auto-removed by safety net");
          removeStaticLoadingScreen();
          clearInterval(checkInterval);
        }
      } else {
        clearInterval(checkInterval);
      }
    }, 100);

    // Absolute fallback after 5 seconds
    const fallbackTimeout = setTimeout(() => {
      if (isLoadingScreenVisible()) {
        console.warn("Loading screen force-removed after timeout");
        removeStaticLoadingScreen();
      }
      clearInterval(checkInterval);
    }, 5000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(fallbackTimeout);
    };
  }, []);

  return (
    <AuthProvider>
      <AuthAwareAIProvider>
        <ConfirmProvider>
          <ErrorBoundary
            // Note: this must a render prop for error fallback
            fallbackRender={({ error }) => <ErrorFallbackPage error={error} />}
          >
            <Routes>
              <Route path="/oidc" element={<OidcCallbackPage />} />
              <Route path="/local_oidc/authorize" element={<AuthorizePage />} />
              <Route
                path="/nb/:id/*"
                element={
                  <AuthGuard>
                    <Suspense
                      fallback={
                        <LoadingState
                          variant="fullscreen"
                          message="Loading notebook..."
                        />
                      }
                    >
                      <NotebookPage />
                    </Suspense>
                  </AuthGuard>
                }
              />
              <Route
                path="/nb"
                element={
                  <AuthGuard>
                    <Suspense
                      fallback={
                        <LoadingState
                          variant="fullscreen"
                          message="Loading notebooks..."
                        />
                      }
                    >
                      <NotebooksDashboardPage />
                    </Suspense>
                  </AuthGuard>
                }
              />
              <Route path="/" element={<Navigate to="/nb" replace />} />
              <Route path="/demo/geojson" element={<GeoJsonDemoPage />} />
              <Route path="/demo/reorder" element={<ReorderDemoPage />} />
              <Route
                path="/demo/trpc"
                element={
                  <AuthGuard>
                    <TrpcDemoPage />
                  </AuthGuard>
                }
              />
              <Route path="/feature-flags" element={<FeatureFlagsPage />} />
              <Route
                path="/health"
                element={
                  <AuthGuard>
                    <HealthPage />
                  </AuthGuard>
                }
              />
            </Routes>
            <FPSMeter />
            <Toaster />
            <Confirmer />
          </ErrorBoundary>
        </ConfirmProvider>
      </AuthAwareAIProvider>
    </AuthProvider>
  );
};
