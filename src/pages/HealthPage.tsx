import { useEffect, useState } from "react";
import { HealthCard, type HealthStatus } from "@/components/HealthCard";

function HealthPageInner() {
  const [healthStatuses, setHealthStatuses] = useState<HealthStatus[]>([]);
  const [liveStoreStatus, setLiveStoreStatus] = useState<HealthStatus | null>(
    null
  );

  useEffect(() => {
    // Fetch tRPC health
    const fetchTrpcHealth = async (): Promise<HealthStatus> => {
      try {
        const response = await fetch("/api/trpc/health");
        const data = await response.json();
        return {
          name: "tRPC health",
          status: response.ok ? ("healthy" as const) : ("unhealthy" as const),
          data,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        return {
          name: "tRPC health",
          status: "error" as const,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        };
      }
    };

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
        { name: "tRPC health", status: "loading" },
        { name: "Iframe Outputs", status: "loading" },
        { name: "LiveStore", status: "loading" },
      ]);

      const [cloudflare, hono, trpc, iframe] = await Promise.all([
        fetchCloudflareHealth(),
        fetchHonoHealth(),
        fetchTrpcHealth(),
        fetchIframeHealth(),
      ]);

      const results: HealthStatus[] = [cloudflare, hono, trpc, iframe];

      // Add LiveStore status if available
      if (liveStoreStatus) {
        results.push(liveStoreStatus);
      } else {
        results.push({
          name: "LiveStore",
          status: "loading",
        });
      }

      setHealthStatuses(results);
    };

    fetchAllHealth();
  }, [liveStoreStatus]);

  // Group health checks by section
  const apiStackChecks = healthStatuses.filter(
    (health) =>
      health.name.includes("Cloudflare") ||
      health.name.includes("Hono") ||
      health.name.includes("tRPC")
  );

  const iframeChecks = healthStatuses.filter((health) =>
    health.name.includes("Iframe")
  );

  return (
    <div className="container mx-auto max-w-6xl p-6">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">API Health Status</h1>
        <p className="text-muted-foreground">
          Real-time health checks for all API endpoints and services.
        </p>
      </div>

      {/* API Stack Section */}
      <div className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold">1. API Stack</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {apiStackChecks.map((health, index) => (
            <HealthCard key={index} health={health} />
          ))}
        </div>
      </div>

      {/* Iframe Section */}
      <div className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold">3. Iframe</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {iframeChecks.map((health, index) => (
            <HealthCard key={index} health={health} />
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="mb-4 text-xl font-semibold">Endpoints</h2>

        <div className="mb-4">
          <h3 className="mb-2 font-semibold">1. API Stack</h3>
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
              <code className="rounded bg-white px-1">tRPC health</code> - tRPC
              public health query
            </li>
          </ul>
        </div>

        <div className="mb-4">
          <h3 className="mb-2 font-semibold">2. LiveStore</h3>
          <ul className="list-inside list-disc space-y-1 text-sm">
            <li>
              <code className="rounded bg-white px-1">LiveStore</code> -
              LiveStore configuration and connectivity check
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-2 font-semibold">3. Iframe</h3>
          <ul className="list-inside list-disc space-y-1 text-sm">
            <li>
              <code className="rounded bg-white px-1">Iframe Outputs</code> -
              Iframe outputs service health check
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function HealthPage() {
  return <HealthPageInner />;
}
