# Package-Maker Operations Runbook

A second operator must be able to follow these steps locally without undocumented
knowledge. Commands are shown as executed on macOS; the Linux equivalents are
identical except where noted.

## Prerequisites

- Node.js >= 20, npm 9+
- SSH access to `github-moewolf` (org) configured
- `moe-icons-code-library` checked out as a sibling of `moe-icons-package-maker`

## 1. Local development

```sh
cd moe-icons-package-maker
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run dev           # primary local UI at http://127.0.0.1:4173
npm run ui:dev        # compatibility alias for npm run dev
npm run ui:build      # production UI to dist-ui/
```

## 2. Catalog maintenance

```sh
# Regenerate the catalog from the official SVG source
npm run catalog:generate -- ../moe-icons-code-library/icons data/icon-catalog.json

# Verify the catalog matches the source (CI does this too)
npm run catalog:reconcile -- data/icon-catalog.json ../moe-icons-code-library/icons

# Add/edit/deprecate/remove an icon (dry-run first)
npx vite-node src/catalog/bin.ts data/icon-catalog.json add --id new-icon --subgroup symbol --label "New Icon" --dry-run
```

Invalid operations leave the catalog byte-identical. Real changes use atomic
tmp-file + rename.

## 3. Build a group (Node CLI / Linux)

```sh
npx vite-node src/cli/node-cli.ts path/to/request.json
```

`request.json` fields: `catalogPath`, `selectedIds`, `svgDir`, `groupId`,
`displayName`, `styleId`, `author`, `outputDir`. Output: `icons.zip`,
`manifest.json`, `report.json`, and the icon SVGs under `outputDir`.

Exit codes: `0` success, `1` build/validation failure, `2` usage error. The
machine-readable result is JSON on stdout.

## 4. GitHub PR submission (PMA-03)

`src/adapters/github/pr.ts` creates a unique `maker/<group>-<ts>` branch, writes
only the approved `inputDir`, and opens a PR. It never writes to the default
branch. Requires a fine-grained token with contents write permission on the
target repository (D-14).

## 5. User R2 publication (PMA-04)

`src/adapters/r2/r2.ts` uploads immutable keys to the user bucket with SigV4
signing, content types, and checksums. On partial failure it deletes already
uploaded keys (best-effort rollback). Secrets live in GitHub Actions secrets,
never `.env`.

## 6. Official release dispatch (PMA-05)

`src/adapters/dispatch/dispatch.ts` only allows the official channel to reach
official/npm publication. User requests labeled official are rejected
(`USER_CANNOT_SELECT_OFFICIAL`). Payloads pin a server-held commit SHA and
artifact checksum; clients cannot supply arbitrary repo/workflow/ref.

## 7. Rollback and incident procedures

| Incident | Procedure |
| --- | --- |
| Bad catalog change | `git show HEAD:data/icon-catalog.json > data/icon-catalog.json` then commit |
| Failed build | `materializeBuild` rolls back staging; no partial final artifact remains |
| Failed R2 upload | `cleanupKeys` deletes uploaded keys; re-run after fixing |
| Bad PR | Close the PR; the branch can be deleted manually |
| Wrong channel request | `validateUserChannel` rejects before any dispatch |

## 8. Environment variables

Non-secret `MAKER_*` variables are documented in `.env.example`. Secret values
(API keys, R2 credentials, GitHub tokens, Auth0 identifiers) are configured in
GitHub Actions secrets / Cloudflare, never committed.
