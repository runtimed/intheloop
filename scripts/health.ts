#!/usr/bin/env tsx
/**
 * Health check script for In the Loop services
 *
 * Usage:
 *   pnpm health                    # Check all services
 *   pnpm health anaconda          # Check only Anaconda API
 */

import { readFileSync } from "fs";
import { join } from "path";

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
  pnpm health anaconda          # Check only Anaconda API

Available checks:
  anaconda    Check Anaconda API endpoint health
`);
  process.exit(0);
}

runHealthChecks(args).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
