# Contributing to In the Loop

Thank you for your interest in contributing to In the Loop! This guide provides everything you need to get your development environment set up and start contributing.

## Core Philosophy

In the Loop is a real-time, collaborative notebook environment built on a modern, local-first stack. We prioritize a clean, maintainable codebase and a smooth developer experience. Our goal is to make it as easy as possible for you to contribute.

## What's Experimental vs Stable

### Stable Foundation

- ✅ LiveStore event-sourcing architecture
- ✅ Real-time collaboration without conflicts
- ✅ Multi-runtime execution support
- ✅ Rich output rendering system
- ✅ Offline-first operation with sync

### Active Development

- 🧪 AI model selection and prompt engineering
- 🧪 Runtime orchestration and health monitoring
- 🧪 Permissions and sharing workflows
- 🧪 Performance optimization for large notebooks
- 🧪 Additional language runtimes

## Areas to contribute

We're building this in the open and welcome experimentation:

**Improve AI Integration ✨**

- Test AI tool calling with your workflows
- Experiment with different model providers
- Build custom tool registries

**Runtime Development**

- Create runtime agents for new languages
- Improve Python package management
- Build compute backends (BYOC)

**Extend Capabilities**

- Add SQL cell support for database workflows
- Build interactive widgets
- Create visualization plugins

**Real-World Usage**

Use In the Loop for actual data science work

- Report issues and workflow friction
- Share feedback on collaboration features

Ready to contribute? The system is stable enough for real use while being open to changes.

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (version 23.0.0 or higher)
- [Deno](https://docs.deno.com/runtime/getting_started/installation/) (version v2.4.1 or higher)
- [pnpm](https://pnpm.io/installation)
- [Git](https://git-scm.com/)

## Development Setup

Getting started with In the Loop is designed to be as simple as possible.

### 1. Clone the Repository

First, clone the In the Loop repository to your local machine:

```bash
git clone https://github.com/runtimed/intheloop.git
cd intheloop
```

### 2. Install Dependencies

Install all project dependencies using `pnpm`. This command will also set up all necessary tooling.

```bash
pnpm install
```

### 3. Configure Your Local Environment

You need to copy the environment configuration files manually:

```bash
# Copy environment configuration files
cp .env.example .env
cp .dev.vars.example .dev.vars
```

- **`.dev.vars`** - Local secrets and variables for the Worker
- **`.env`** - Environment variables for the Vite build process

These files are already in `.gitignore` and should **never** be committed to the repository.

**Note**: The example files contain sensible defaults that work for local development out of the box.

### 4. Run the Development Server

Start the entire In the Loop application (both the React frontend and the Cloudflare Worker backend) with a single command:

```bash
pnpm dev
```

This will start the integrated development server using the Vite Cloudflare plugin. You can now access the In the Loop application in your browser at **`http://localhost:5173`**. The unified server handles both frontend assets and backend API requests, providing a seamless development experience.

### 5. Enable Python Execution

To run Python code cells, you need to start the separate Pyodide runtime agent.

1.  Open In the Loop in your browser (`http://localhost:5173`).
2.  Create a new notebook.
3.  Click the **Runtime** button in the notebook header to view the required startup command.
4.  Copy the command (it will look something like `NOTEBOOK_ID=notebook-xyz... pnpm dev:runtime`).
5.  Run that command in a **new terminal window**.

Your notebook is now connected to a Python runtime and can execute code cells.

## Schema Linking for Development

The `@runtimed/schema` package provides shared types and events for In the Loop. The linking method depends on your development phase:

### Production (JSR Package)

```json
"@runtimed/schema": "^0.1.0"
```

Use this for stable releases and production deployments.

### Testing PR Changes (GitHub Reference)

```json
"@runtimed/schema": "workspace:*"
```

Use this when testing changes from a merged PR in the Runt repository. Replace the commit hash with the specific commit you want to test.

### Local Development (File Link)

```json
"@runtimed/schema": "workspace:*"
```

Use this when developing locally with both In the Loop and Runt repositories side-by-side.

### Switching Between Modes

1. **Update `package.json`** with the appropriate schema reference
2. **Run `pnpm install`** to update dependencies
3. **Restart your development server** (`pnpm dev`)

**Important**: Always ensure both repositories are using compatible schema versions. Type errors usually indicate schema mismatches.

## Deployment

We use a unified Cloudflare Worker architecture that serves both the web client and backend API. Deploy with:

- **Production**: `pnpm deploy:production`
- **Preview**: `pnpm deploy:preview`

The deployment process builds the web client and deploys the all-in-one worker to Cloudflare.

**Note**: Before deploying, you must configure the required secrets for the target environment using the `wrangler secret put` command.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## Code Style and Conventions

We follow a consistent code style to keep the project maintainable.

- **TypeScript**: We use strict mode across the project.
- **Formatting**: We use Prettier for code formatting. Please run `pnpm format` before committing.
- **Linting**: We use ESLint to catch common errors. Run `pnpm lint` to check your code.
- **Testing**: Run `pnpm test` to execute the test suite (60+ tests covering core functionality).
- **Architecture**: We prefer functional programming patterns.
- **Development stability**: The integrated dev server is stable with hot reload for most changes. .env file changes are ignored to prevent crashes.

## Submitting a Contribution

1.  Create a new branch for your feature or bugfix: `git checkout -b feature/my-awesome-feature`.
2.  Make your changes and add tests where appropriate.
3.  Ensure all checks pass by running `pnpm check`.
4.  Commit your changes with a clear and descriptive message.
5.  Push your branch and open a Pull Request against the `main` branch.

We appreciate your contributions and will review your PR as soon as possible!
