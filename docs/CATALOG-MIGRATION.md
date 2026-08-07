# Catalog Migration Policy

Versioned rule for the canonical `IconCatalog` (schema v1).

## Deprecation vs removal

- New icons are added with `addCatalogIcon`.
- An icon may be deprecated with `deprecateCatalogIcon(id, { replacedBy?, migrationNote? })`,
  which sets `deprecatedAt` (ISO 8601) and optionally `replacedBy`.
- An icon may only be **removed** after it is deprecated, or with `--force` plus a
  dry-run report listing the impact.

## Replacement rules

- `replacedBy` must reference an existing canonical icon id.
- `replacedBy` must not reference itself.
- Replacement chains must not form a cycle (`a -> b -> a` is rejected).
- `migrationNote` is a non-empty free-text note surfaced to consumers.

## Compatibility

- Fields `deprecatedAt`, `replacedBy`, `migrationNote` are optional and
  backward-compatible: catalogs without them still parse (schema v1 unchanged).
- Consumers that generate style groups produce a warning when an icon is
  deprecated, but do not fail on it.

## Migration flow

1. `moeicons catalog deprecate <id> --replaced-by <new-id> --note "<reason>"` (dry-run supported).
2. Review the dry-run report; run without `--dry-run` to persist.
3. Later, in a separate reviewed change, remove the deprecated icon with
   `moeicons catalog remove <id>` once no consumer references it.

## Validation

`parseIconCatalog` rejects: dangling `replacedBy`, self-replacement,
replacement cycles, and malformed `deprecatedAt`/`replacedBy`/`migrationNote`.
