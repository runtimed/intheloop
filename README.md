# In the Loop

**The notebook that thinks with you.**

Try it out on:
[app.runt.run](https://app.runt.run). It's stable for experimentation and real usage, actively developed.

In the Loop is an **agentic notebook** where AI, code, and prose work together in
real-time. Never lose your outputs when tabs close. Collaborate with AI that
sees your data, not just your code. Built on event-sourced architecture for
persistent, collaborative computation.

## The Jupyter Problem We're Solving

As a long-time Jupyter contributor, I've always wanted to solve a core
architectural limitation: computation and documentation are artificially
coupled.

At Netflix, I watched people hold their laptops open walking to the parking lot,
hoping their Spark jobs would finish before they lost their browser session.
Your analysis is running on powerful clusters, but the results only "exist" in
your specific browser tab.

**The core problem**: You can't open the same notebook in multiple tabs.
Multiple people can't collaborate on the same server without conflicts. Your
work is trapped in a single browser session.

**Why this happens**: Jupyter's architecture wasn't designed for concurrent
access. The notebook exists as a file on disk, but the live state (outputs,
execution results) only lives in your browser. Close that tab, and you lose the
connection to work happening elsewhere.

**In the Loop's approach**: Persistent outputs that survive browser crashes, tab
closures, and device switches. Real-time collaboration without conflicts. AI
that sees your actual results. Full Jupyter compatibility through .ipynb
import/export. Your computation lives independently of any browser session.

## Quick Start

### Prerequisites

You need the following installed:

- **Node.js**
- **pnpm**

This repo was tested to run on Mac (Apple Silicon), Ubuntu 24 Linux (64-bit ARM), and Window 11 (64-bit ARM).

### 1. Install and Configure

```bash
pnpm install  # Install dependencies

# Copy environment configuration files
cp .env.example .env
cp .dev.vars.example .dev.vars

# Start integrated development server (frontend + backend proxy)
pnpm dev           # http://localhost:5173

# Start backend sync server (separate terminal)
pnpm dev:sync      # Backend API and sync functionality

# Start iframe outputs server (separate terminal)
pnpm dev:iframe    # http://localhost:8000
```

The example files contain working defaults for local development:

- `.env.example` → `.env` - Frontend environment variables (Vite)
- `.dev.vars.example` → `.dev.vars` - Backend environment variables (Worker)

### 2. Create Your First Notebook

1. Open http://localhost:5173
2. Click "New Notebook"
3. Start creating cells and editing

### 3. Start a Runtime (Two Options)

**Option A: In-Browser Python Runtime**

This one launches automatically when you run a code cell. However, you can also launch it manualy.

- Click the **Runtime** button in the notebook header
- Click **Launch Python Runtime**
- Full Python with scientific stack loads in ~10 seconds

**Option B: [External Runtime Agent](./docs/external-runtime.md)**

### 4. Execute Code

- Add a code cell in the web interface
- Write some Python code:
  ```python
  import numpy as np
  np.random.random(5)
  ```
- Press **Cmd+Enter** (Mac) or **Ctrl+Enter** (Linux/Windows), or click the play button [▶︎]
- See results appear instantly across all connected clients

### 5. Install Packages

In the Python runtime, use `micropip` to install additional packages:

```python
import micropip
await micropip.install("package-name")
```

For example:

```python
import micropip
await micropip.install("cowsay")
import cowsay
cowsay.cow("I'm in the loop!")
```

**Note**: Core packages (numpy, pandas, matplotlib) are pre-loaded. You can see the installed packages with `micropip.list()`

### 6. Try AI Locally

- [Download Ollama](https://ollama.com)
- Install a [model that supports tool calls](https://ollama.com/search?c=tools). One big 14GB popular mode is [`gpt-oss:20b`](https://ollama.com/library/gpt-oss:20b)
  ```
  ollama run gpt-oss:20b
  ```
- Update your `.env` file with:
  ```
  VITE_AI_PROVIDER="ollama"
  ```
- If you have the `pnpm dev:sync` running, restart it
- Reload the page (localhost:5173)
- You should see the AI selector contain the new models

### 7. More features

Learn more about [what works today](./docs/what-works-today.md).

## Known Limitations

- Single active runtime per notebook
- No runtime resource limits
- Issues with the AI picker. AI API keys dont't work locally for OpenAI, Groq
- No supports for secrets (which would enable database integrations)

## Contributing

You can help make it better by contributing. We welcome code contributions and ideas! See the documentation links below for more information.

## Documentation

- **[Developing](./DEVELOPMENT.md)** - Developing in this repo
- **[Contributing](./CONTRIBUTING.md)** - Contribute to this project
- **[Deployment Guide](./DEPLOYMENT.md)** - Production deployment instructions
- **[Roadmap](./ROADMAP.md)** - Development priorities and future plans

- **[AI Development Context](./AGENTS.md)** - An AGENTS.md file for contributors and AI agents.

## License

BSD 3-Clause
