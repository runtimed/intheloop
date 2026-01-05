import { useEffect, useState } from "react";
import { TrpcProvider, useTrpc } from "@/components/TrpcProvider";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth";

interface HealthStatus {
  name: string;
  status: "loading" | "healthy" | "unhealthy" | "error";
  data?: any;
  error?: string;
  timestamp?: string;
}

function HealthPageInner() {
  const { accessToken } = useAuth();
  const trpc = useTrpc();
  const [healthStatuses, setHealthStatuses] = useState<HealthStatus[]>([]);

  // tRPC health queries
  const trpcHealth = useQuery(trpc.health.queryOptions());
  const trpcHealthAuthed = useQuery(trpc.healthAuthed.queryOptions());

  useEffect(() => {
    // Fetch basic Cloudflare health
    const fetchCloudflareHealth = async (): Promise<HealthStatus> => {
      try {
        const response = await fetch("/api/cloudflare-health");
        const data = await response.json();
        return {
          name: "Cloudflare GET /cloudflare-health",
          status: response.ok ? ("healthy" as const) : ("unhealthy" as const),
          data,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        return {
          name: "Cloudflare GET /cloudflare-health",
          status: "error" as const,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        };
      }
    };

    // Fetch Hono health
    const fetchHonoHealth = async (): Promise<HealthStatus> => {
      try {
        const response = await fetch("/api/health");
        const data = await response.json();
        return {
          name: "Hono GET /api/health",
          status: response.ok ? ("healthy" as const) : ("unhealthy" as const),
          data,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        return {
          name: "Hono GET /api/health",
          status: "error" as const,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        };
      }
    };

    // Fetch authed Hono health
    const fetchAuthedHonoHealth = async (): Promise<HealthStatus> => {
      try {
        const headers: HeadersInit = {};
        if (accessToken) {
          headers.Authorization = `Bearer ${accessToken}`;
        }
        const response = await fetch("/api/health/authed", { headers });
        const data = await response.json();
        return {
          name: "Hono GET /api/health/authed",
          status: response.ok ? ("healthy" as const) : ("unhealthy" as const),
          data,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        return {
          name: "Hono GET /api/health/authed",
          status: "error" as const,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        };
      }
    };

    // Fetch sync health
    const fetchSyncHealth = async (): Promise<HealthStatus> => {
      try {
        const response = await fetch("/api/health/sync");
        const data = await response.json();
        return {
          name: "Sync GET /api/health/sync",
          status: response.ok ? ("healthy" as const) : ("unhealthy" as const),
          data,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        return {
          name: "Sync GET /api/health/sync",
          status: "error" as const,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        };
      }
    };

    // Fetch iframe outputs health
    const fetchIframeHealth = async (): Promise<HealthStatus> => {
      try {
        const iframeUrl =
          import.meta.env.VITE_IFRAME_OUTPUT_URI || "http://localhost:8000";
        const response = await fetch(`${iframeUrl}/index.html`, {
          method: "HEAD",
        });
        return {
          name: "Iframe Outputs",
          status: response.ok ? ("healthy" as const) : ("unhealthy" as const),
          data: {
            url: iframeUrl,
            status: response.status,
            statusText: response.statusText,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        return {
          name: "Iframe Outputs",
          status: "error" as const,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        };
      }
    };

    const fetchAllHealth = async () => {
      setHealthStatuses([
        { name: "Cloudflare GET /health", status: "loading" },
        { name: "Hono GET /api/health", status: "loading" },
        { name: "Hono GET /api/health/authed", status: "loading" },
        { name: "Sync GET /api/health/sync", status: "loading" },
        { name: "Iframe Outputs", status: "loading" },
        { name: "tRPC health", status: "loading" },
        { name: "tRPC healthAuthed", status: "loading" },
      ]);

      const [cloudflare, hono, authedHono, sync, iframe] = await Promise.all([
        fetchCloudflareHealth(),
        fetchHonoHealth(),
        fetchAuthedHonoHealth(),
        fetchSyncHealth(),
        fetchIframeHealth(),
      ]);

      const results: HealthStatus[] = [
        cloudflare,
        hono,
        authedHono,
        sync,
        iframe,
      ];

      // Add tRPC results
      if (trpcHealth.data) {
        results.push({
          name: "tRPC health",
          status: "healthy",
          data: trpcHealth.data,
          timestamp: new Date().toISOString(),
        });
      } else if (trpcHealth.error) {
        results.push({
          name: "tRPC health",
          status: "error",
          error:
            trpcHealth.error instanceof Error
              ? trpcHealth.error.message
              : "Unknown error",
          timestamp: new Date().toISOString(),
        });
      } else {
        results.push({
          name: "tRPC health",
          status: "loading",
        });
      }

      if (trpcHealthAuthed.data) {
        results.push({
          name: "tRPC healthAuthed",
          status: "healthy",
          data: trpcHealthAuthed.data,
          timestamp: new Date().toISOString(),
        });
      } else if (trpcHealthAuthed.error) {
        results.push({
          name: "tRPC healthAuthed",
          status: "error",
          error:
            trpcHealthAuthed.error instanceof Error
              ? trpcHealthAuthed.error.message
              : "Unknown error",
          timestamp: new Date().toISOString(),
        });
      } else {
        results.push({
          name: "tRPC healthAuthed",
          status: "loading",
        });
      }

      setHealthStatuses(results);
    };

    fetchAllHealth();
  }, [
    trpcHealth.data,
    trpcHealth.error,
    trpcHealthAuthed.data,
    trpcHealthAuthed.error,
    accessToken,
  ]);

  const getStatusColor = (status: HealthStatus["status"]) => {
    switch (status) {
      case "healthy":
        return "text-green-600 bg-green-50 border-green-200";
      case "unhealthy":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "error":
        return "text-red-600 bg-red-50 border-red-200";
      case "loading":
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getStatusIcon = (status: HealthStatus["status"]) => {
    switch (status) {
      case "healthy":
        return "✅";
      case "unhealthy":
        return "⚠️";
      case "error":
        return "❌";
      case "loading":
        return "⏳";
    }
  };

  return (
    <div className="container mx-auto max-w-6xl p-6">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">API Health Status</h1>
        <p className="text-muted-foreground">
          Real-time health checks for all API endpoints and services.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {healthStatuses.map((health, index) => (
          <div
            key={index}
            className={`rounded-lg border p-4 ${getStatusColor(health.status)}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{health.name}</h3>
              <span className="text-2xl">{getStatusIcon(health.status)}</span>
            </div>

            {health.status === "loading" && (
              <p className="text-sm">Checking...</p>
            )}

            {health.error && (
              <div className="mt-2">
                <p className="text-sm font-medium">Error:</p>
                <p className="text-sm">{health.error}</p>
              </div>
            )}

            {health.data && (
              <div className="mt-2">
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">
                    View Details
                  </summary>
                  <pre className="mt-2 overflow-auto rounded bg-white/50 p-2 text-xs">
                    {JSON.stringify(health.data, null, 2)}
                  </pre>
                </details>
              </div>
            )}

            {health.timestamp && (
              <p className="mt-2 text-xs opacity-70">
                Checked: {new Date(health.timestamp).toLocaleString()}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="mb-2 text-xl font-semibold">Endpoints</h2>
        <ul className="list-inside list-disc space-y-1 text-sm">
          <li>
            <code className="rounded bg-white px-1">
              GET /cloudflare-health
            </code>{" "}
            - Basic Cloudflare health check
          </li>
          <li>
            <code className="rounded bg-white px-1">GET /api/health</code> -
            Hono framework health check
          </li>
          <li>
            <code className="rounded bg-white px-1">
              GET /api/health/authed
            </code>{" "}
            - Authenticated Hono health check
          </li>
          <li>
            <code className="rounded bg-white px-1">GET /api/health/sync</code>{" "}
            - Sync service health check
          </li>
          <li>
            <code className="rounded bg-white px-1">tRPC health</code> - tRPC
            public health query
          </li>
          <li>
            <code className="rounded bg-white px-1">tRPC healthAuthed</code> -
            tRPC authenticated health query
          </li>
          <li>
            <code className="rounded bg-white px-1">Iframe Outputs</code> -
            Iframe outputs service health check
          </li>
        </ul>
      </div>
    </div>
  );
}

export function HealthPage() {
  return (
    <TrpcProvider>
      <HealthPageInner />
    </TrpcProvider>
  );
}
