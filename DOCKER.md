# Docker Build and Run Guide

This guide explains how to build and run the In the Loop frontend using Docker.

## Overview

The Docker image builds the production frontend and serves it using Vite's preview server.

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

The main issue is the `web` Docker image needing access to `localhost:8787`. Docker won't be able to access ports on the host machine. If you want to run it, the easiest way is to also run the `sync` image in Docker.

Otherwise, you can test these images individually to make sure they're working.

### Building and Running Individual Images

#### Web Service

Build the web image:

```shell
docker build -f Dockerfile.web -t intheloop-web:latest .
```

Run the web service:

```shell
docker run -p 5173:5173 intheloop-web:latest
```

The web service will be available at `http://localhost:5173`. Note that it expects the sync service to be available at `http://sync:8787` (when running in docker-compose) or you'll need to configure the `VITE_API_TARGET` environment variable.

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
