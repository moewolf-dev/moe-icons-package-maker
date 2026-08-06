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

## Security principles

- Never executes untrusted SVG; parses XML with a non-executing parser.
- All user uploads are treated as untrusted; validation is stable and
  machine-readable.
- Secrets never enter the browser bundle or the core package.

## Status

Scaffold + Phase 1 contracts in progress.
