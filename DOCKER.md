# Docker Deployment Guide

This guide explains how to run In the Loop using Docker.

## Quick Start

### Build the Image

```bash
docker build -t intheloop:latest .
```

### Run with Docker Compose

```bash
docker-compose up
```

This will start:

- Frontend server on port 5173
- Backend worker on port 8787
- Iframe outputs worker on port 8000

### Run with Docker

```bash
docker run -p 5173:5173 -p 8787:8787 -p 8000:8000 intheloop:latest
```

## Configuration

### Environment Variables

You can control which services run using environment variables:

- `RUN_BACKEND=false` - Disable backend worker
- `RUN_IFRAME=false` - Disable iframe outputs worker
- `RUN_FRONTEND=false` - Disable frontend server

### Cloudflare Worker Configuration

The Docker image runs `wrangler dev` for the backend workers. You'll need to:

1. **Authenticate with Cloudflare** (if using remote D1/R2):

   ```bash
   docker run -it -v $(pwd)/.wrangler:/app/.wrangler intheloop:latest wrangler login
   ```

2. **Mount local database** (for local D1):

   ```bash
   docker run -v $(pwd)/.wrangler:/app/.wrangler intheloop:latest
   ```

3. **Set environment variables** for authentication:
   ```bash
   docker run -e AUTH_ISSUER="http://localhost:8787/local_oidc" \
              -e ALLOW_LOCAL_AUTH="true" \
              -e DEPLOYMENT_ENV="development" \
              intheloop:latest
   ```

## Architecture

The Docker image is built in three stages:

1. **deps**: Installs all dependencies
2. **builder**: Builds the frontend and iframe outputs
3. **runtime**: Serves the built files and runs workers

### What's Included

- Production-built frontend (from `dist/`)
- Iframe outputs worker (from `iframe-outputs/worker/dist/`)
- Backend worker code (runs via `wrangler dev`)
- All necessary packages and dependencies

### Ports

- **5173**: Frontend static files (http-server)
- **8787**: Backend Cloudflare Worker (wrangler dev)
- **8000**: Iframe outputs Cloudflare Worker (wrangler dev)

## Development vs Production

### Development Mode

The Docker image runs `wrangler dev` which:

- Uses local D1 database (in `.wrangler/` directory)
- Supports hot reload
- Requires Cloudflare credentials for remote resources

### Production Mode

For production deployment, consider:

- Using Cloudflare Workers directly (not Docker)
- Or serving static files only (set `RUN_BACKEND=false` and `RUN_IFRAME=false`)
- Configure reverse proxy for backend worker

## Limitations

1. **Cloudflare Workers**: Running `wrangler dev` in Docker may have limitations compared to native Cloudflare Workers deployment
2. **Local D1 Database**: Requires mounting `.wrangler/` directory for persistence
3. **Authentication**: Production auth requires Cloudflare Workers deployment for proper OIDC integration

## Troubleshooting

### Backend Worker Won't Start

- Check Cloudflare authentication: `wrangler login`
- Verify `.wrangler/` directory is mounted for local database
- Check environment variables match `wrangler.toml` configuration

### Frontend Can't Connect to Backend

- Ensure backend worker is running on port 8787
- Check `VITE_LIVESTORE_SYNC_URL` matches backend URL
- Verify CORS settings in `wrangler.toml`

### Iframe Outputs Not Loading

- Verify iframe outputs worker is running on port 8000
- Check `VITE_IFRAME_OUTPUT_URI` environment variable
- Ensure iframe outputs worker is accessible from frontend domain

## Alternative: Static Files Only

If you only need to serve the static frontend:

```bash
docker run -e RUN_BACKEND=false -e RUN_IFRAME=false -p 5173:5173 intheloop:latest
```

This serves only the built frontend files without the backend workers.
