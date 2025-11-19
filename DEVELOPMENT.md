## Architecture

In the Loop is built as a monorepo with four core packages and a unified web client:

### Core Packages (`packages/`)

- **`@runtimed/schema`** - Event-sourced schema definitions with full type safety across the ecosystem
- **`@runtimed/agent-core`** - Runtime agent framework with artifact storage and observability
- **`@runtimed/ai-core`** - Multi-provider AI integration (OpenAI, Ollama, Groq) with tool calling
- **`@runtimed/pyodide-runtime`** - In-browser Python runtime with scientific computing stack

### Runtime System

In the Loop supports **three execution paradigms**:

1. **External Runtime Agents** - Python execution via `@runt/pyodide-runtime-agent` (JSR package)
2. **In-Browser HTML Runtime** - Direct DOM execution for HTML/CSS/JavaScript
3. **In-Browser Python Runtime** - Pyodide-powered Python with numpy, pandas, matplotlib

All runtimes share the same LiveStore event-sourced backend for consistent state management.

### Key Technologies

- **LiveStore** - Event-sourcing library for local-first apps with real-time sync
- **Effect** - Functional programming library for TypeScript
- **React** - UI framework with CodeMirror editors
- **Cloudflare Workers** - Production deployment with D1 (SQLite) and R2 (object storage)

## Environment Variables

### Runtime Logging

- `VITE_RUNT_LOG_LEVEL`: Control runtime agent verbosity
  - `DEBUG`: All logs including debug info
  - `INFO`: Informational and above (default dev)
  - `WARN`: Warnings and errors only
  - `ERROR`: Errors only (default production)

Example:

```bash
# Enable verbose logging for troubleshooting
VITE_RUNT_LOG_LEVEL=DEBUG pnpm dev

# Quiet mode for clean output
VITE_RUNT_LOG_LEVEL=ERROR pnpm dev
```

See `.env.example` and `.dev.vars.example` for complete configuration options.

## Deployment

In the Loop runs on **Cloudflare Workers** with a unified architecture:

- **Single Worker** serves both frontend assets and backend API
- **D1 Database** stores LiveStore events for persistence
- **R2 Bucket** handles artifact storage for large outputs
- **Durable Objects** manage WebSocket connections for real-time sync

This architecture provides robust collaboration and artifact storage while simplifying deployment.

[More on deployment ▶︎](DEPLOYMENT.md)

## Development Commands

```bash
# Development
pnpm dev              # Integrated server (frontend + backend)
pnpm dev:iframe       # Iframe outputs server
pnpm dev:runtime      # External runtime agent (should probably get command from UI)

# Quality Checks
pnpm check            # Type check + lint + format check
pnpm test             # Run test suite
pnpm test:integration # Integration tests only

# Building
pnpm build            # Build for development
pnpm build:production # Optimized production build
```

## Troubleshooting

| Problem                | Solution                                                       |
| ---------------------- | -------------------------------------------------------------- |
| Schema errors          | Restart all services after package changes                     |
| Runtime not connecting | Check API key creation and copy exact command from UI          |
| Dev server crashes     | Run `pnpm dev` again - .env changes don't auto-restart         |
| Build failures         | Run `pnpm type-check` to identify TypeScript issues            |
| Lost notebooks         | Run `rm -rf .wrangler` ⚠️ **WARNING: This deletes local data** |

## Package Development

The monorepo structure allows local development of runtime packages:

```bash
# Work on schema changes
cd packages/schema
pnpm type-check

# Test agent-core modifications
cd packages/agent-core
pnpm lint

# All packages use workspace:* dependencies for local development
```

Schema changes automatically propagate to all consuming packages through workspace linking.
