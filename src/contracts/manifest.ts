/**
 * IconGroupManifest: the schema for a packaged icon style group produced by the
 * package-maker. Covers partial groups, author/source/license metadata,
 * per-icon file mappings, and a validation summary.
 */

import { ICON_GROUP_MANIFEST_SCHEMA_VERSION } from "./types";

/** A single canonical file mapping inside a group. */
export interface IconGroupEntry {
  /** Canonical icon ID. */
  readonly iconId: string;
  /** Canonical subgroup ID. */
  readonly subgroupId: string;
  /** Relative output path within the style group, e.g. `arrow/arrow-chevron-right.svg`. */
  readonly outputPath: string;
  /** SHA-256 of the SVG bytes (hex). */
  readonly checksum: string;
}

/** Author identity and provenance metadata. */
export interface GroupAuthorMetadata {
  readonly name: string;
  readonly email?: string;
  readonly source?: string;
  readonly license?: string;
}

/** Summary counts derived from validation, never from UI counters. */
export interface ValidationSummary {
  readonly selected: number;
  readonly filled: number;
  readonly valid: number;
  readonly warnings: number;
  readonly errors: number;
  readonly missing: number;
}

/** A packaged icon style group manifest. */
export interface IconGroupManifest {
  readonly schemaVersion: number;
  readonly groupId: string;
  readonly displayName: string;
  readonly styleId: string;
  readonly author: GroupAuthorMetadata;
  readonly createdWith: string;
  readonly createdAt: string;
  readonly entries: readonly IconGroupEntry[];
  readonly validation: ValidationSummary;
}

export interface ManifestIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly path?: string;
}

export type ManifestResult =
  | { readonly ok: true; readonly value: IconGroupManifest }
  | { readonly ok: false; readonly errors: ManifestIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const RE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Runtime-validate an unknown value as an IconGroupManifest. Returns issues
 * rather than throwing. Rejects unknown future major schema versions.
 */
export function parseIconGroupManifest(input: unknown): ManifestResult {
  const errors: ManifestIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [{ code: "NOT_OBJECT", severity: "error", message: "manifest must be an object" }],
    };
  }

  if (typeof input.schemaVersion !== "number") {
    errors.push({ code: "MISSING_SCHEMA_VERSION", severity: "error", message: "schemaVersion required" });
  } else if (input.schemaVersion !== ICON_GROUP_MANIFEST_SCHEMA_VERSION) {
    errors.push({
      code: "UNSUPPORTED_SCHEMA_VERSION",
      severity: "error",
      message: `unsupported schema version ${String(input.schemaVersion)}`,
    });
  }

  if (typeof input.groupId !== "string" || !RE_ID.test(input.groupId)) {
    errors.push({ code: "INVALID_GROUP_ID", severity: "error", message: "groupId must be lowercase kebab-case" });
  }
  if (typeof input.displayName !== "string" || input.displayName.trim().length === 0) {
    errors.push({ code: "MISSING_DISPLAY_NAME", severity: "error", message: "displayName required" });
  }
  if (typeof input.styleId !== "string" || !RE_ID.test(input.styleId)) {
    errors.push({ code: "INVALID_STYLE_ID", severity: "error", message: "styleId must be lowercase kebab-case" });
  }

  if (!isRecord(input.author)) {
    errors.push({ code: "INVALID_AUTHOR", severity: "error", message: "author must be an object" });
  } else {
    if (typeof input.author.name !== "string" || input.author.name.trim().length === 0) {
      errors.push({ code: "MISSING_AUTHOR_NAME", severity: "error", message: "author.name required" });
    }
  }

  if (typeof input.createdWith !== "string" || input.createdWith.length === 0) {
    errors.push({ code: "MISSING_CREATED_WITH", severity: "error", message: "createdWith required" });
  }
  if (typeof input.createdAt !== "string" || Number.isNaN(Date.parse(input.createdAt))) {
    errors.push({ code: "INVALID_CREATED_AT", severity: "error", message: "createdAt must be ISO 8601" });
  }

  if (!Array.isArray(input.entries)) {
    errors.push({ code: "MISSING_ENTRIES", severity: "error", message: "entries must be an array" });
  } else {
    const seen = new Set<string>();
    input.entries.forEach((entry, i) => {
      const path = `entries[${i}]`;
      if (!isRecord(entry)) {
        errors.push({ code: "INVALID_ENTRY", severity: "error", message: `${path}: must be object`, path });
        return;
      }
      if (typeof entry.iconId !== "string" || !RE_ID.test(entry.iconId)) {
        errors.push({ code: "INVALID_ENTRY_ICON_ID", severity: "error", message: `${path}.iconId invalid`, path });
      }
      if (typeof entry.subgroupId !== "string" || !RE_ID.test(entry.subgroupId)) {
        errors.push({ code: "INVALID_ENTRY_SUBGROUP", severity: "error", message: `${path}.subgroupId invalid`, path });
      }
      if (typeof entry.outputPath !== "string" || entry.outputPath.includes("..")) {
        errors.push({ code: "INVALID_OUTPUT_PATH", severity: "error", message: `${path}.outputPath invalid`, path });
      }
      if (typeof entry.checksum !== "string" || !/^[0-9a-f]{64}$/.test(entry.checksum)) {
        errors.push({ code: "INVALID_CHECKSUM", severity: "error", message: `${path}.checksum must be sha256 hex`, path });
      }
      if (typeof entry.iconId === "string") {
        if (seen.has(entry.iconId)) {
          errors.push({ code: "DUPLICATE_ENTRY", severity: "error", message: `${path}: duplicate iconId`, path });
        }
        seen.add(entry.iconId);
      }
    });
  }

  const v = input.validation;
  if (!isRecord(v)) {
    errors.push({ code: "MISSING_VALIDATION", severity: "error", message: "validation summary required" });
  } else {
    for (const key of ["selected", "filled", "valid", "warnings", "errors", "missing"] as const) {
      if (typeof v[key] !== "number" || v[key] < 0) {
        errors.push({ code: "INVALID_VALIDATION_COUNT", severity: "error", message: `validation.${key} must be a non-negative number` });
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      schemaVersion: input.schemaVersion as number,
      groupId: String(input.groupId),
      displayName: String(input.displayName),
      styleId: String(input.styleId),
      author: input.author as GroupAuthorMetadata,
      createdWith: String(input.createdWith),
      createdAt: String(input.createdAt),
      entries: input.entries as IconGroupEntry[],
      validation: input.validation as ValidationSummary,
    },
  };
}
