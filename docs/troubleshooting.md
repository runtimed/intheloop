# Troubleshooting Guide

## Vite Segfault on Ubuntu

If you encounter a segfault when running `pnpm run vite` on Ubuntu, this is typically caused by native dependencies not being properly built for your platform.

### Quick Fix

```bash
# Rebuild all native dependencies
pnpm rebuild

# If that doesn't work, force rebuild
pnpm rebuild --force

# Then try running vite again
pnpm run vite
```

### Complete Solution

1. **Install system dependencies** (required for building native modules):

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y build-essential python3 python3-pip

# Or on minimal systems, at minimum:
sudo apt-get install -y g++ make python3
```

2. **Clear caches and rebuild**:

```bash
# Clear pnpm cache
pnpm store prune

# Remove node_modules and reinstall
rm -rf node_modules
pnpm install

# Force rebuild native dependencies
pnpm rebuild --force
```

3. **Verify Node.js version**:

The project requires Node.js >=23.0.0. Check your version:

```bash
node --version
```

If you need to upgrade, use [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 23
nvm use 23
```

### Native Dependencies

The following native dependencies are built during installation:

- `@parcel/watcher` - File watching
- `@tailwindcss/oxide` - Tailwind CSS compiler
- `esbuild` - JavaScript bundler
- `msgpackr-extract` - MessagePack serialization
- `sharp` - Image processing
- `workerd` - Cloudflare Workers runtime

If any of these fail to build, you may need additional system libraries. For example, `sharp` requires:

```bash
sudo apt-get install -y libvips-dev
```

### Architecture-Specific Issues

If you're on ARM (e.g., Apple Silicon, ARM64 Ubuntu), ensure all dependencies support your architecture:

```bash
# Check architecture
uname -m

# Some packages may need explicit architecture flags
export npm_config_target_arch=arm64  # or x64
pnpm install --force
```

### Docker Alternative

If native builds continue to fail, consider using Docker:

```bash
docker-compose up web
```

This uses pre-built images with all dependencies properly configured.
