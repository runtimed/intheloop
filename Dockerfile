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
RUN apk add --no-cache bash git && corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Build arguments for environment variables
# Note: These are build-time configuration values for Vite, not runtime secrets.
# Vite embeds these values into the JavaScript bundle at build time.
# They are safe to include in the Dockerfile as they are public configuration values.
ARG VITE_AUTH_URI=https://auth.anaconda.com/api/auth
ARG VITE_AUTH_CLIENT_ID=74a51ff4-5814-48fa-9ae7-6d3ef0aca3e2
ARG VITE_AUTH_REDIRECT_URI=https://app.runt.run/oidc
ARG VITE_LIVESTORE_SYNC_URL=/livestore
ARG VITE_IFRAME_OUTPUT_URI=https://runtusercontent.com
ARG VITE_AI_PROVIDER=anaconda
ARG VITE_LS_DEV=true

# Set environment variables
# Note: These ENV values are build-time configuration for Vite, not runtime secrets.
ENV VITE_AUTH_URI=${VITE_AUTH_URI}
ENV VITE_AUTH_CLIENT_ID=${VITE_AUTH_CLIENT_ID}
ENV VITE_AUTH_REDIRECT_URI=${VITE_AUTH_REDIRECT_URI}
ENV VITE_LIVESTORE_SYNC_URL=${VITE_LIVESTORE_SYNC_URL}
ENV VITE_IFRAME_OUTPUT_URI=${VITE_IFRAME_OUTPUT_URI}
ENV VITE_AI_PROVIDER=${VITE_AI_PROVIDER}
ENV VITE_LS_DEV=${VITE_LS_DEV}

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
COPY scripts ./scripts

# Build frontend
RUN pnpm build:production

# Stage 3: Production runtime
FROM node:23-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Expose port (default Vite preview port is 4173, but we're using 5173 so auth works)
EXPOSE 5173

# Run production server (vite preview serves the built files)
CMD ["pnpm", "preview", "--host", "0.0.0.0", "--port", "5173"]
