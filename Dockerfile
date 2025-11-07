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

# Install dependencies
# Note: Using --no-frozen-lockfile for Docker builds to handle lockfile updates
# In production CI, ensure lockfile is up to date before building
RUN pnpm install --no-frozen-lockfile

# Stage 2: Build application
FROM node:23-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/agent-core/node_modules ./packages/agent-core/node_modules
COPY --from=deps /app/packages/ai-core/node_modules ./packages/ai-core/node_modules
COPY --from=deps /app/packages/pyodide-runtime/node_modules ./packages/pyodide-runtime/node_modules
COPY --from=deps /app/packages/schema/node_modules ./packages/schema/node_modules

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agent-core/package.json packages/agent-core/tsconfig.json ./packages/agent-core/
COPY packages/ai-core/package.json packages/ai-core/tsconfig.json ./packages/ai-core/
COPY packages/pyodide-runtime/package.json packages/pyodide-runtime/tsconfig.json ./packages/pyodide-runtime/
COPY packages/schema/package.json packages/schema/tsconfig.json ./packages/schema/

# Copy source code
COPY src ./src
COPY packages/agent-core/src ./packages/agent-core/src
COPY packages/ai-core/src ./packages/ai-core/src
COPY packages/pyodide-runtime/src ./packages/pyodide-runtime/src
COPY packages/schema/src ./packages/schema/src
COPY backend ./backend
COPY public ./public
COPY index.html ./
COPY vite.config.ts tsconfig.json tsconfig.node.json ./
COPY vite-plugins ./vite-plugins

# Build frontend
RUN pnpm build:production

