#!/usr/bin/env node

import http from "node:http";
import httpProxy from "http-proxy";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5173;
const API_TARGET = process.env.API_TARGET || "http://localhost:8787";
const DIST_DIR = path.resolve(__dirname, "..", "dist");

if (!existsSync(DIST_DIR)) {
  console.error(`Error: dist directory not found at ${DIST_DIR}`);
  console.error("Please run 'pnpm build:preview' first");
  process.exit(1);
}

// Create proxy for /api and /graphql
const proxy = httpProxy.createProxyServer({
  target: API_TARGET,
  changeOrigin: true,
});

proxy.on("error", (err, req, res) => {
  console.error("Proxy error:", err.message);
  if (!res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`Proxy error: ${err.message}`);
  }
});

// MIME type mapping
const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || "application/octet-stream";
}

// Serve static files
async function serveStatic(req, res) {
  // Resolve the file path and normalize it
  const requestedPath = req.url === "/" ? "index.html" : req.url;
  let filePath = path.resolve(DIST_DIR, requestedPath);

  // Security: prevent directory traversal - ensure resolved path is within DIST_DIR
  if (!filePath.startsWith(path.resolve(DIST_DIR))) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  try {
    const stats = await stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    const content = await readFile(filePath);
    const mimeType = getMimeType(filePath);

    res.writeHead(200, {
      "Content-Type": mimeType,
      "Cache-Control": "no-cache",
    });
    res.end(content);
  } catch (err) {
    // If file not found and it's not an API route, try index.html (SPA fallback)
    if (
      err.code === "ENOENT" &&
      !req.url?.startsWith("/api") &&
      !req.url?.startsWith("/graphql")
    ) {
      try {
        const indexPath = path.join(DIST_DIR, "index.html");
        const content = await readFile(indexPath);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      }
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  }
}

// Create custom HTTP server that handles both static files and proxying
const server = http.createServer((req, res) => {
  // Proxy /api and /graphql requests
  if (req.url?.startsWith("/api") || req.url?.startsWith("/graphql")) {
    return proxy.web(req, res);
  }

  // For all other requests, serve static files
  serveStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Proxying /api and /graphql to ${API_TARGET}`);
  console.log(`Serving static files from ${DIST_DIR}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    console.error("Server error:", err);
    process.exit(1);
  }
});
