# Multi-stage Dockerfile for In the Loop
# Builds the frontend and optionally runs the backend worker

# Stage 1: Build dependencies
FROM node:23-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy package files for workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/

# Copy iframe-outputs worker package (not in workspace)
COPY iframe-outputs/worker/package.json ./iframe-outputs/worker/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Build frontend
FROM node:23-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/*/node_modules ./packages/*/node_modules
COPY --from=deps /app/iframe-outputs/worker/node_modules ./iframe-outputs/worker/node_modules

# Copy source code
COPY . .

# Build frontend (production mode)
RUN pnpm build:production:fast

# Build iframe outputs
RUN pnpm build:iframe

# Stage 3: Runtime
FROM node:23-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    apk add --no-cache curl
WORKDIR /app

# Install wrangler for backend worker
RUN pnpm add -g wrangler@4.27.0 http-server@latest

# Copy built assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/iframe-outputs/worker/dist ./iframe-outputs/worker/dist

# Copy backend and configuration
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/wrangler.toml ./wrangler.toml
COPY --from=builder /app/iframe-outputs/worker/wrangler.toml ./iframe-outputs/worker/wrangler.toml
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Copy workspace packages needed for runtime
COPY --from=builder /app/packages/*/package.json ./packages/*/
COPY --from=builder /app/packages/schema ./packages/schema

# Copy iframe-outputs worker files
COPY --from=builder /app/iframe-outputs/worker/package.json ./iframe-outputs/worker/
COPY --from=builder /app/iframe-outputs/worker/src ./iframe-outputs/worker/src
COPY --from=builder /app/iframe-outputs/worker/tsconfig.json ./iframe-outputs/worker/tsconfig.json

# Install minimal runtime dependencies
RUN pnpm install --prod --frozen-lockfile

# Create entrypoint script
RUN echo '#!/bin/sh\n\
set -e\n\
\n\
# Start backend worker in background\n\
if [ "$RUN_BACKEND" != "false" ]; then\n\
  echo "Starting backend worker..."\n\
  wrangler dev --port 8787 --host 0.0.0.0 &\n\
  BACKEND_PID=$!\n\
fi\n\
\n\
# Start iframe outputs worker in background\n\
if [ "$RUN_IFRAME" != "false" ]; then\n\
  echo "Starting iframe outputs worker..."\n\
  cd iframe-outputs/worker\n\
  wrangler dev --port 8000 --host 0.0.0.0 &\n\
  IFRAME_PID=$!\n\
  cd ../..\n\
fi\n\
\n\
# Start static file server\n\
if [ "$RUN_FRONTEND" != "false" ]; then\n\
  echo "Starting frontend server on port 5173..."\n\
  exec http-server ./dist -p 5173 --cors -a 0.0.0.0\n\
else\n\
  # Keep container running if frontend is disabled\n\
  wait\n\
fi\n\
' > /entrypoint.sh && chmod +x /entrypoint.sh

# Expose ports
# 5173: Main app (static files)
# 8787: Backend worker
# 8000: Iframe outputs worker
EXPOSE 5173 8787 8000

# Use entrypoint script
ENTRYPOINT ["/entrypoint.sh"]

