#!/bin/bash
set -e

# Generate .dev.vars from environment variables if they are set
# This allows docker-compose environment variables to override defaults
cat > .dev.vars <<EOF
# Generated from Docker environment variables
AUTH_ISSUER="${AUTH_ISSUER:-http://localhost:8787/local_oidc}"
ALLOW_LOCAL_AUTH="${ALLOW_LOCAL_AUTH:-true}"
PG_CONNECTION_STRING="${PG_CONNECTION_STRING:-postgresql://postgres:password@postgres:5432/intheloop-dev?sslmode=disable}"
ADMIN_SECRET="${ADMIN_SECRET:-dev-admin-secret}"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-development}"
SERVICE_PROVIDER="${SERVICE_PROVIDER:-local}"
EXTENSION_CONFIG="${EXTENSION_CONFIG:-{}}"
ARTIFACT_STORAGE="${ARTIFACT_STORAGE:-local}"
ARTIFACT_THRESHOLD="${ARTIFACT_THRESHOLD:-16384}"
EOF

echo "Generated .dev.vars:"
cat .dev.vars

# Run migrations then start the sync service
pnpm run db:migrate && pnpm run docker:sync

