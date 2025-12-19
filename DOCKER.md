# Docker Build and Run Guide

This guide explains how to build and run In the Loop services using Docker.

## Overview

In the Loop consists of three Docker services:

- **web**: Production frontend served via nginx
- **sync**: Backend API and WebSocket sync service (Cloudflare Worker)
- **iframe-outputs**: Sandboxed output rendering service

## Prerequisites

- Docker installed and running

## Building All Services

To build all services:

```shell
docker compose build
```

To build without cache:

```shell
docker-compose build --no-cache
```

To build and start all services:

```shell
docker-compose up --build
```

## Running All Images

To run all services together using docker-compose:

### Basic Run

Start all services in the foreground:

```shell
docker compose up
```

### Service Dependencies

The services communicate via the `intheloop-network` Docker network:

- The `web` service connects to `sync` at `http://sync:8787` (internal Docker DNS)
- All services can communicate using their service names as hostnames

## Testing Images Individually

You can build and run individual services for testing. The `web` service requires the `sync` service to be accessible.

### Building and Running Individual Images

#### Web Service

Build the web image:

```shell
docker build -f Dockerfile.web -t intheloop-web:latest .
```

**Running with docker-compose (recommended):**

The web service automatically connects to the `sync` service via Docker network DNS:

```shell
docker compose up web
```

**Running standalone:**

When running standalone, you need to specify where the sync service is located using the `SYNC_HOST` environment variable:

```shell
# If sync is running on host machine (Mac/Windows)
docker run -p 5173:5173 -e SYNC_HOST=host.docker.internal intheloop-web:latest

# If sync is running on host machine (Linux)
docker run -p 5173:5173 -e SYNC_HOST=172.17.0.1 intheloop-web:latest

# If sync is running in another Docker container with a known IP
docker run -p 5173:5173 -e SYNC_HOST=<container-ip> intheloop-web:latest
```

The web service will be available at `http://localhost:5173`. By default, `SYNC_HOST` is set to `sync` (for docker-compose usage).

#### Iframe Outputs Service

Build the iframe-outputs image:

```shell
docker build -f Dockerfile.iframe-outputs -t intheloop-iframe-outputs:latest .
```

Run the iframe-outputs service:

```shell
docker run -p 8000:8000 intheloop-iframe-outputs:latest
```

The iframe-outputs service will be available at `http://localhost:8000`.

#### Sync Service

Build the sync image:

```shell
docker build -f Dockerfile.sync -t intheloop-sync:latest .
```

Run the sync service:

```shell
docker run -p 8787:8787 intheloop-sync:latest
```

The sync service will be available at `http://localhost:8787`.

## Environment Variables

### Web Service

- `SYNC_HOST` (default: `sync`): Hostname or IP address of the sync service. Used by nginx to proxy API requests. Set to `sync` for docker-compose, or override for standalone runs.

### Sync Service

The sync service uses environment variables from `.dev.vars` file. See `.dev.vars.example` for configuration options.

## Troubleshooting

### "host not found in upstream 'sync'"

This error occurs when running the web container standalone without setting `SYNC_HOST`. Either:

1. Use docker-compose to run all services together, or
2. Set `SYNC_HOST` environment variable when running the web container standalone

### Web service can't connect to sync service

- Verify the sync service is running and accessible
- Check that `SYNC_HOST` is set correctly for your environment
- On Linux, you may need to use the Docker bridge IP (`172.17.0.1`) instead of `host.docker.internal`
- Ensure both containers are on the same Docker network if running separately
