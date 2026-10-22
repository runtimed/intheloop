# Notebook preview

Prebuilt notebook preview pages for embedding in an iframe. Copy `dist/` into
your application's static assets and load `dist/index.html`. Send notebook data
to the iframe with `postMessage({ json: notebook }, targetOrigin)` after receiving
the `iframe-loaded` message. `react.html`, `demo.html`, and `health.html` remain
available alongside the main page.

## 0.3.0-beta.2

- Rebuild with MapLibre GL JS 6.4.1 to fix CVE-2026-85061.
- Patch the React map wrapper's ESM import for MapLibre 6's named exports.
- Bundle and configure MapLibre 6's separate map worker for the iframe pages.
- Publish the self-contained `dist/` assets without runtime dependencies. React
  and `@runtimed/components` are build dependencies; installing them again in the
  host application is unnecessary and pulled in an older MapLibre version.

From the repository root, run `pnpm --filter @runtimed/notebook-preview pack` to
build and package the preview. Only the preview package needs publishing for
this release; the components package is bundled into its assets.
