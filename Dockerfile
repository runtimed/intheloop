# Multi-stage Dockerfile for In the Loop
# Builds the frontend and optionally runs the backend worker

# Stage 1: Build dependencies
FROM node:23-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy package files for workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agent-core/package.json ./packages/agent-core/
COPY packages/ai-core/package.json ./packages/ai-core/
COPY packages/pyodide-runtime/package.json ./packages/pyodide-runtime/
COPY packages/schema/package.json ./packages/schema/

# Copy iframe-outputs worker package (not in workspace)
COPY iframe-outputs/worker/package.json ./iframe-outputs/worker/

# Install dependencies
# Note: Using --no-frozen-lockfile for Docker builds to handle lockfile updates
# In production CI, ensure lockfile is up to date before building
RUN pnpm install --no-frozen-lockfile

