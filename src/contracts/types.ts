/**
 * Shared contract types for the Moeicons package-maker and its consumers.
 *
 * Versioned schemas: every public type is paired with a runtime validator and a
 * stable schema version. Consumers must reject unknown future major versions.
 */

/** Schema version marker for IconCatalog payloads. */
export const ICON_CATALOG_SCHEMA_VERSION = 1;

/** Schema version marker for IconGroupManifest payloads. */
export const ICON_GROUP_MANIFEST_SCHEMA_VERSION = 1;

/** A single canonical icon definition. */
export interface IconDefinition {
  /** Canonical kebab-case icon ID, e.g. `arrow-chevron-right`. Byte-for-byte immutable. */
  readonly id: string;
  /** Subgroup ID derived from the first hyphen segment, e.g. `arrow`. */
  readonly subgroupId: string;
  /** Human-readable label used in search and display. */
  readonly label: string;
  /** Search aliases; case-folded for lookup, never used to replace the canonical ID. */
  readonly aliases: readonly string[];
  /** Reference icon used for preview when the user has not supplied an SVG. */
  readonly referenceIcon?: string;
  /** ISO 8601 timestamp when the icon was deprecated (empty = active). */
  readonly deprecatedAt?: string;
  /** Canonical id that should replace this icon once deprecated. */
  readonly replacedBy?: string;
  /** Optional migration note shown to consumers. */
  readonly migrationNote?: string;
  /** Timestamps in ISO 8601. */
  readonly addedAt: string;
  readonly updatedAt: string;
}

/** The full canonical icon catalog. */
export interface IconCatalog {
  readonly schemaVersion: number;
  readonly icons: readonly IconDefinition[];
}

/** Catalog lookup index: maps by ID, subgroup, and normalized search tokens. */
export interface CatalogIndex {
  /** Canonical ID -> definition. */
  readonly byId: ReadonlyMap<string, IconDefinition>;
  /** Subgroup ID -> definitions in canonical stable order. */
  readonly bySubgroup: ReadonlyMap<string, readonly IconDefinition[]>;
  /** Normalized search token -> canonical IDs. */
  readonly byToken: ReadonlyMap<string, readonly string[]>;
  /** Stable order of canonical IDs. */
  readonly order: readonly string[];
}
