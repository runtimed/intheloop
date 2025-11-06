# Dockerfile for iframe-outputs
# Builds and serves the isolated iframe content for rendering user-generated outputs
#
# Build context should be from the project root (anode/):
#   docker build -f iframe-outputs/Dockerfile -t iframe-outputs:latest .
#
# Or from iframe-outputs directory with parent context:
#   docker build -f Dockerfile -t iframe-outputs:latest ..

# Stage 1: Install dependencies
FROM node:23-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy root package.json to get workspace dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/

# Copy iframe-outputs worker package.json
COPY iframe-outputs/worker/package.json ./iframe-outputs/worker/

# Install dependencies
# Note: Using --frozen-lockfile for reproducible builds
# If lockfile is out of date, use --no-frozen-lockfile
RUN pnpm install --frozen-lockfile

# Stage 2: Build iframe outputs
FROM node:23-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/*/node_modules ./packages/*/node_modules
COPY --from=deps /app/iframe-outputs/worker/node_modules ./iframe-outputs/worker/node_modules

# Copy iframe-outputs source files
COPY iframe-outputs/src/ ./iframe-outputs/src/
COPY iframe-outputs/vite.config.ts iframe-outputs/tsconfig*.json ./iframe-outputs/

# Copy shared components from main src directory (needed by iframe-outputs)
COPY src/components/outputs/shared-with-iframe ./src/components/outputs/shared-with-iframe/
COPY src/components/ui ./src/components/ui/

# Copy worker source files
COPY iframe-outputs/worker/worker.ts iframe-outputs/worker/tsconfig.json iframe-outputs/worker/wrangler.toml ./iframe-outputs/worker/

# Build iframe outputs with Vite
# Using root package.json script which runs: cd iframe-outputs && vite build
WORKDIR /app
RUN pnpm build:iframe

# Stage 3: Runtime - serve iframe outputs
FROM node:23-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    apk add --no-cache curl
WORKDIR /app

# Install wrangler for serving the worker
RUN pnpm add -g wrangler@4.25.0

# Copy built assets
COPY --from=builder /app/iframe-outputs/worker/dist ./worker/dist

# Copy worker files
COPY --from=builder /app/iframe-outputs/worker/worker.ts ./worker/
COPY --from=builder /app/iframe-outputs/worker/wrangler.toml ./worker/
COPY --from=builder /app/iframe-outputs/worker/package.json ./worker/
COPY --from=builder /app/iframe-outputs/worker/tsconfig.json ./worker/

# Expose port for iframe outputs server
EXPOSE 8000

# Start wrangler dev server to serve iframe outputs
WORKDIR /app/worker
CMD ["wrangler", "dev", "--port", "8000", "--host", "0.0.0.0"]

