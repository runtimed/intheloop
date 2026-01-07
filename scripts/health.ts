#!/usr/bin/env tsx
/**
 * Health check script for In the Loop services
 *
 * Usage:
 *   pnpm health                    # Check all services
 *   pnpm health livestore         # Check only LiveStore endpoint
 *   pnpm health anaconda          # Check only Anaconda API
 */

import { readFileSync } from "fs";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface HealthCheckResult {
  name: string;
  status: "ok" | "error";
  message: string;
  details?: unknown;
}

/**
 * Load environment variables from .env file
 */
function loadEnv(): Record<string, string> {
  try {
    const envPath = join(process.cwd(), ".env");
    const envContent = readFileSync(envPath, "utf-8");
    const env: Record<string, string> = {};

    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const [, key, value] = match;
          // Remove quotes if present
          const cleanValue = value.replace(/^["']|["']$/g, "");
          env[key] = cleanValue;
        }
      }
    }

    return env;
  } catch (error) {
    console.warn("Warning: Could not load .env file:", error);
    return {};
  }
}

/**
 * Check LiveStore endpoint health using curl
 */
async function checkLiveStore(): Promise<HealthCheckResult> {
  const env = loadEnv();
  const syncUrl =
    env.VITE_LIVESTORE_SYNC_URL ||
    process.env.VITE_LIVESTORE_SYNC_URL ||
    "ws://localhost:8787/livestore";

  try {
    // Convert WebSocket URL to HTTP URL for health check
    let httpUrl = syncUrl
      .replace(/^ws:\/\//, "http://")
      .replace(/^wss:\/\//, "https://");

    // If it's a relative path, assume localhost:8787
    if (httpUrl.startsWith("/")) {
      httpUrl = `http://localhost:8787${httpUrl}`;
    }

    // Add storeId query parameter (required by endpoint)
    const url = new URL(httpUrl);
    url.searchParams.set("storeId", "health-check");

    const urlString = url.toString();

    // Use curl to check endpoint reachability with WebSocket upgrade headers
    // -i: Include headers in output
    // -N: Don't buffer output
    // --no-buffer: Disable buffering
    // --max-time 5: Timeout after 5 seconds
    // -H: Add headers for WebSocket upgrade
    try {
      const { stdout, stderr } = await execFileAsync("curl", [
        "-i",
        "-N",
        "--no-buffer",
        "--max-time",
        "5",
        "-H",
        "Connection: Upgrade",
        "-H",
        "Upgrade: websocket",
        "-H",
        "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==",
        "-H",
        "Sec-WebSocket-Version: 13",
        urlString,
      ]);

      // Parse HTTP status line from curl output
      // curl -i outputs headers first, then body
      const output = stdout || stderr || "";
      const statusLineMatch = output.match(/^HTTP\/[\d.]+ (\d+) (.+)$/m);

      if (statusLineMatch) {
        const statusCode = parseInt(statusLineMatch[1], 10);
        const statusText = statusLineMatch[2];

        // Any HTTP response (even errors) means the endpoint is reachable
        // 400/500 errors are expected - endpoint is reachable but may require proper WebSocket upgrade
        if (statusCode >= 400 && statusCode < 600) {
          // Extract error message from body if present
          const bodyMatch = output.match(/\r?\n\r?\n(.+)$/s);
          const errorBody = bodyMatch
            ? bodyMatch[1].substring(0, 200)
            : "Expected validation error";

          return {
            name: "LiveStore",
            status: "ok",
            message: `Endpoint reachable (status ${statusCode})`,
            details: {
              status: statusCode,
              statusText,
              url: urlString,
              error: errorBody,
            },
          };
        }

        // 101 Switching Protocols would be ideal, but any 2xx/3xx also means reachable
        return {
          name: "LiveStore",
          status: "ok",
          message: `Endpoint reachable (status ${statusCode})`,
          details: {
            status: statusCode,
            statusText,
            url: urlString,
          },
        };
      }

      // If we got output but couldn't parse status, endpoint responded
      return {
        name: "LiveStore",
        status: "ok",
        message: "Endpoint reachable (response received)",
        details: {
          url: urlString,
          output: output.substring(0, 500), // Truncate long output
        },
      };
    } catch (execError: unknown) {
      // execFile throws an error if curl exits with non-zero status
      // But we might still have gotten a response (stderr contains it)
      const error = execError as {
        stdout?: string;
        stderr?: string;
        code?: number;
      };

      // If we have stderr output, try to parse it for HTTP status
      const output = (error.stderr || error.stdout || "").trim();
      const statusLineMatch = output.match(/^HTTP\/[\d.]+ (\d+) (.+)$/m);

      if (statusLineMatch) {
        const statusCode = parseInt(statusLineMatch[1], 10);
        const statusText = statusLineMatch[2];

        // Even if curl exited with error, HTTP response means endpoint is reachable
        return {
          name: "LiveStore",
          status: "ok",
          message: `Endpoint reachable (status ${statusCode})`,
          details: {
            status: statusCode,
            statusText,
            url: urlString,
            curlExitCode: error.code,
          },
        };
      }

      // Check for timeout (exit code 28) or connection refused (exit code 7)
      if (error.code === 28) {
        return {
          name: "LiveStore",
          status: "error",
          message: "Request timeout - endpoint may be unreachable",
          details: {
            url: urlString,
            error: "Timeout after 5 seconds",
          },
        };
      }

      if (error.code === 7) {
        return {
          name: "LiveStore",
          status: "error",
          message: "Connection refused - endpoint may be down",
          details: {
            url: urlString,
            error: "Connection refused",
          },
        };
      }

      // Other curl errors
      return {
        name: "LiveStore",
        status: "error",
        message: `curl failed (exit code ${error.code || "unknown"})`,
        details: {
          url: urlString,
          error: output || String(execError),
          exitCode: error.code,
        },
      };
    }
  } catch (error) {
    return {
      name: "LiveStore",
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      details: {
        syncUrl,
        error,
      },
    };
  }
}

/**
 * Check Anaconda API endpoint health
 */
async function checkAnacondaAPI(): Promise<HealthCheckResult> {
  const env = loadEnv();
  const apiKey = env.VITE_ANACONDA_API_KEY || process.env.VITE_ANACONDA_API_KEY;

  if (!apiKey) {
    return {
      name: "Anaconda API",
      status: "error",
      message: "VITE_ANACONDA_API_KEY not found in .env or environment",
    };
  }

  try {
    const url = "https://anaconda.com/api/assistant/v3/groq/chat/completions";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Client-Version": "0.3.0",
        "X-Client-Source": "anaconda-runt-dev",
      },
      body: JSON.stringify({}),
    });

    const status = response.status;
    const headers = Object.fromEntries(response.headers.entries());

    if (status === 400) {
      // 400 is expected for empty body - endpoint is reachable
      const body = await response.json().catch(() => ({}));
      return {
        name: "Anaconda API",
        status: "ok",
        message: `Endpoint reachable (status ${status})`,
        details: {
          status,
          rateLimitRemaining: headers["x-ratelimit-remaining-requests"],
          rateLimitLimit: headers["x-ratelimit-limit-requests"],
          error: body.error?.message || "Expected validation error",
        },
      };
    }

    if (status >= 200 && status < 500) {
      return {
        name: "Anaconda API",
        status: "ok",
        message: `Endpoint reachable (status ${status})`,
        details: {
          status,
          rateLimitRemaining: headers["x-ratelimit-remaining-requests"],
          rateLimitLimit: headers["x-ratelimit-limit-requests"],
        },
      };
    }

    return {
      name: "Anaconda API",
      status: "error",
      message: `Unexpected status: ${status}`,
      details: { status, headers },
    };
  } catch (error) {
    return {
      name: "Anaconda API",
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      details: error,
    };
  }
}

/**
 * Run all health checks
 */
async function runHealthChecks(checks: string[] = []): Promise<void> {
  const checkMap: Record<string, () => Promise<HealthCheckResult>> = {
    livestore: checkLiveStore,
    anaconda: checkAnacondaAPI,
  };

  const checksToRun =
    checks.length > 0
      ? checks
          .map((name) => {
            const check = checkMap[name];
            if (!check) {
              console.error(`Unknown check: ${name}`);
              return null;
            }
            return check;
          })
          .filter(
            (check): check is () => Promise<HealthCheckResult> => check !== null
          )
      : Object.values(checkMap);

  if (checks.length > 0 && checksToRun.length === 0) {
    console.error(`Unknown check(s): ${checks.join(", ")}`);
    console.log(`Available checks: ${Object.keys(checkMap).join(", ")}`);
    process.exit(1);
  }

  console.log("Running health checks...\n");

  const results: HealthCheckResult[] = [];
  for (const check of checksToRun) {
    const result = await check();
    results.push(result);
  }

  console.log("\nResults:");
  console.log("=".repeat(60));

  let hasErrors = false;
  for (const result of results) {
    const icon = result.status === "ok" ? "✅" : "❌";
    console.log(`${icon} ${result.name}: ${result.message}`);

    if (result.details) {
      console.log(`   Details:`, JSON.stringify(result.details, null, 2));
    }

    if (result.status === "error") {
      hasErrors = true;
    }
  }

  console.log("=".repeat(60));

  if (hasErrors) {
    console.log("\nSome health checks failed.");
    process.exit(1);
  } else {
    console.log("\nAll health checks passed.");
    process.exit(0);
  }
}

// Run if executed directly
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Health check script for In the Loop services

Usage:
  pnpm health                    # Check all services
  pnpm health livestore         # Check only LiveStore endpoint
  pnpm health anaconda          # Check only Anaconda API

Available checks:
  livestore   Check LiveStore sync endpoint health
  anaconda    Check Anaconda API endpoint health
`);
  process.exit(0);
}

runHealthChecks(args).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
