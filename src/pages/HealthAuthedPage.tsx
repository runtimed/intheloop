import { useEffect, useState } from "react";
import { TrpcProvider, useTrpc } from "@/components/TrpcProvider";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth";
import { HealthCard, type HealthStatus } from "@/components/HealthCard";

function HealthAuthedPageInner() {
  const { accessToken } = useAuth();
  const trpc = useTrpc();
  const [healthStatuses, setHealthStatuses] = useState<HealthStatus[]>([]);

  // tRPC authed health query
  const trpcHealthAuthed = useQuery(trpc.healthAuthed.queryOptions());

  useEffect(() => {
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

    const fetchAllHealth = async () => {
      setHealthStatuses([
        { name: "Hono GET /api/health/authed", status: "loading" },
        { name: "tRPC healthAuthed", status: "loading" },
      ]);

      const [authedHono] = await Promise.all([fetchAuthedHonoHealth()]);

      const results: HealthStatus[] = [authedHono];

      // Add tRPC results
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
  }, [trpcHealthAuthed.data, trpcHealthAuthed.error, accessToken]);

  return (
    <div className="container mx-auto max-w-6xl p-6">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">
          Authenticated API Health Status
        </h1>
        <p className="text-muted-foreground">
          Health checks for authenticated API endpoints and services.
        </p>
      </div>

      {/* Authenticated API Stack Section */}
      <div className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold">Authenticated Endpoints</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {healthStatuses.map((health, index) => (
            <HealthCard key={index} health={health} />
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="mb-4 text-xl font-semibold">Endpoints</h2>

        <div>
          <h3 className="mb-2 font-semibold">Authenticated API Stack</h3>
          <ul className="list-inside list-disc space-y-1 text-sm">
            <li>
              <code className="rounded bg-white px-1">
                GET /api/health/authed
              </code>{" "}
              - Authenticated Hono health check
            </li>
            <li>
              <code className="rounded bg-white px-1">tRPC healthAuthed</code> -
              tRPC authenticated health query
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function HealthAuthedPage() {
  return (
    <TrpcProvider>
      <HealthAuthedPageInner />
    </TrpcProvider>
  );
}
