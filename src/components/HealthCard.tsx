export interface HealthStatus {
  name: string;
  status: "loading" | "healthy" | "unhealthy" | "error";
  data?: any;
  error?: string;
  timestamp?: string;
}

function getStatusClass(status: HealthStatus["status"]): string {
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
}

function getStatusIcon(status: HealthStatus["status"]): string {
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
}

interface HealthCardProps {
  health: HealthStatus;
}

export function HealthCard({ health }: HealthCardProps) {
  return (
    <div className={`rounded-lg border p-4 ${getStatusClass(health.status)}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-semibold">{health.name}</h3>
        <span className="text-2xl">{getStatusIcon(health.status)}</span>
      </div>

      {health.status === "loading" && <p className="text-sm">Checking...</p>}

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
  );
}
