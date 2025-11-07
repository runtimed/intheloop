# Docker Build and Run Guide

This guide explains how to build and run the In the Loop frontend using Docker.

## Overview

The Docker image builds the production frontend and serves it using Vite's preview server. The backend workers (Cloudflare Workers) should be deployed separately to Cloudflare.

## Prerequisites

- Docker installed and running
- Node.js 23+ (for local development, not required for Docker)
- pnpm 10.9+ (for local development, not required for Docker)

## Building the Docker Image

### Basic Build

```bash
docker build -t intheloop:latest .
```

### Build with Custom Configuration

You can customize the build-time configuration using build arguments:

```bash
docker build \
  --build-arg VITE_AUTH_URI=https://auth.anaconda.com/api/auth \
  --build-arg VITE_AUTH_CLIENT_ID=your-client-id \
  --build-arg VITE_AUTH_REDIRECT_URI=https://app.runt.run/oidc \
  --build-arg VITE_LIVESTORE_SYNC_URL=/livestore \
  --build-arg VITE_IFRAME_OUTPUT_URI=https://runtusercontent.com \
  --build-arg VITE_AI_PROVIDER=anaconda \
  --build-arg VITE_LS_DEV=false \
  -t intheloop:latest .
```

### Build Arguments

| Argument                  | Default                                | Description                                    |
| ------------------------- | -------------------------------------- | ---------------------------------------------- |
| `VITE_AUTH_URI`           | `https://auth.anaconda.com/api/auth`   | OAuth provider endpoint                        |
| `VITE_AUTH_CLIENT_ID`     | `74a51ff4-5814-48fa-9ae7-6d3ef0aca3e2` | OAuth client ID                                |
| `VITE_AUTH_REDIRECT_URI`  | `https://app.runt.run/oidc`            | OAuth redirect URI                             |
| `VITE_LIVESTORE_SYNC_URL` | `/livestore`                           | LiveStore sync endpoint (relative to frontend) |
| `VITE_IFRAME_OUTPUT_URI`  | `https://runtusercontent.com`          | Iframe outputs service URL                     |
| `VITE_AI_PROVIDER`        | `anaconda`                             | AI provider identifier                         |
| `VITE_LS_DEV`             | `true`                                 | Enable LiveStore dev mode                      |

**Note**: These values are embedded into the JavaScript bundle at build time. They are public configuration values, not secrets.

## Running the Container

### Basic Run

```bash
docker run -p 5173:5173 intheloop:latest
```

The frontend will be available at `http://localhost:5173`.

### Run with Docker Compose

```bash
docker-compose up
```

This will build and start the container with the configuration from `docker-compose.yml`.

### Run in Detached Mode

```bash
docker run -d -p 5173:5173 --name intheloop intheloop:latest
```

### Run with Custom Port

```bash
docker run -p 8080:5173 intheloop:latest
```

The frontend will be available at `http://localhost:8080`.

## Architecture

The Dockerfile uses a multi-stage build:

1. **deps stage**: Installs all npm dependencies using pnpm
2. **builder stage**: Builds the production frontend bundle
3. **runtime stage**: Serves the built static files using Vite preview

### What's Included

- Production-built frontend (from `dist/`)
- All necessary runtime dependencies
- Vite preview server for serving static files

### What's Not Included

- Backend Cloudflare Workers (deploy separately)
- Iframe outputs worker (deploy separately)
- Database (Cloudflare D1, deployed separately)

## Port Configuration

The container exposes port **5173** by default (Vite preview server). This port is used instead of the standard 4173 to ensure OAuth redirects work correctly.

## Production Deployment

### Frontend Only

The Docker image serves only the frontend. For a complete deployment:

1. **Deploy backend worker** to Cloudflare Workers (see `DEPLOYMENT.md`)
2. **Deploy iframe outputs worker** to Cloudflare Workers
3. **Run frontend container** with proper configuration pointing to deployed workers

### Example Production Setup

```bash
# Build with production configuration
docker build \
  --build-arg VITE_AUTH_URI=https://auth.anaconda.com/api/auth \
  --build-arg VITE_AUTH_CLIENT_ID=your-production-client-id \
  --build-arg VITE_AUTH_REDIRECT_URI=https://app.runt.run/oidc \
  --build-arg VITE_LIVESTORE_SYNC_URL=https://api.runt.run/livestore \
  --build-arg VITE_IFRAME_OUTPUT_URI=https://runtusercontent.com \
  --build-arg VITE_AI_PROVIDER=anaconda \
  --build-arg VITE_LS_DEV=false \
  -t intheloop:production .

# Run container
docker run -d -p 5173:5173 --name intheloop-prod intheloop:production
```

### Reverse Proxy Setup

For production, you'll typically run the container behind a reverse proxy (nginx, Caddy, etc.):

```nginx
server {
    listen 80;
    server_name app.runt.run;

    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Troubleshooting

### Container Won't Start

- Check Docker logs: `docker logs intheloop`
- Verify port 5173 is not in use: `lsof -i :5173`
- Ensure the image was built successfully: `docker images | grep intheloop`

### Frontend Can't Connect to Backend

- Verify `VITE_LIVESTORE_SYNC_URL` points to your deployed backend worker
- Check CORS settings in your Cloudflare Worker configuration
- Ensure the backend worker is deployed and accessible

### Build Fails

- Ensure `pnpm-lock.yaml` is up to date
- Check that all package.json files are present
- Verify Node.js version compatibility (requires Node 23+)

### OAuth Redirects Not Working

- Verify `VITE_AUTH_REDIRECT_URI` matches your OAuth provider configuration
- Ensure the redirect URI uses the correct domain and port
- Check that the OAuth provider allows your redirect URI

## Development vs Production

### Development

For local development, use the integrated dev server:

```bash
pnpm dev
```

This runs both frontend and backend together with hot reload.

### Production

For production, use Docker to build and serve the optimized frontend:

```bash
docker build -t intheloop:latest .
docker run -p 5173:5173 intheloop:latest
```

## Image Size Optimization

The Dockerfile uses multi-stage builds to minimize the final image size:

- **deps stage**: ~500MB (includes all dependencies)
- **builder stage**: ~600MB (includes build tools)
- **runtime stage**: ~200MB (only production dependencies and built files)

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Build Docker image
  run: |
    docker build -t intheloop:${{ github.sha }} .
    docker tag intheloop:${{ github.sha }} intheloop:latest

- name: Push to registry
  run: |
    docker push intheloop:${{ github.sha }}
    docker push intheloop:latest
```

## Additional Resources

- [Deployment Guide](./DEPLOYMENT.md) - Full deployment instructions
- [Development Guide](./CONTRIBUTING.md) - Local development setup
- [README](./README.md) - Project overview
