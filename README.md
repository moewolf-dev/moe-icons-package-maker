# moe-icons-package-maker

Moeicons online visual package maker. Lets users (and the official developer)
assemble a custom icon style group: search the canonical icon catalog, fill each
icon slot with their own SVG, validate, preview, and produce a deterministic
ZIP ready for the moe-icons code-library pipeline.

## Running modes

- **Embedded**: the framework-neutral core API is imported directly by
  `moe-icons-website` (no iframe, no server, no secrets).
- **Local web app**: a local TypeScript + Vite + React UI for the developer.
- **GitHub Action**: validates an immutable build request and publishes
  artifacts.
- **Node/Linux CLI**: JSON-in/JSON-out for automation.

## Local Web UI

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4173`. The local app shows the canonical catalog,
serves official reference SVGs from a sibling `moe-icons-code-library`
checkout when available, accepts click or drag-and-drop SVG uploads, previews
the uploaded file, validates it, and prepares partial or complete style groups.
The server binds to loopback by default; use Vite flags explicitly if another
host or port is required.

## Security principles

- Never executes untrusted SVG; parses XML with a non-executing parser.
- All user uploads are treated as untrusted; validation is stable and
  machine-readable.
- Secrets never enter the browser bundle or the core package.

## Status

Core, local UI, embedding API, CLI, and automation adapters are implemented.
Live Auth0, staging GitHub/R2, and publication acceptance remain tracked in the
coordination repository.
