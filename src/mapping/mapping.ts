import type { IconCatalog, IconDefinition } from "../contracts/types";
import { indexIconCatalog } from "../catalog/catalog";
import type { SvgSource } from "../svg/parse";

/**
 * User-to-canonical mapping. One slot per selected canonical ID; partial groups
 * are allowed. Canonical hyphens are preserved; no lossy renaming heuristics.
 */

export interface AssignmentState {
  /** Canonical icon ID -> assigned source name (opaque). */
  readonly assigned: ReadonlyMap<string, string>;
}

export interface MappingSlot {
  readonly icon: IconDefinition;
  /** Opaque source reference (file name or browser File id). */
  readonly assignedSource: string | undefined;
}

export type MappingState = readonly MappingSlot[];

export interface MappingIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly iconId?: string;
  readonly path?: string;
}

export type MappingResult =
  | { readonly ok: true; readonly value: MappingState }
  | { readonly ok: false; readonly errors: MappingIssue[] };

/**
 * Create one slot per selected canonical ID. Unknown IDs are rejected; partial
 * groups are allowed (missing icons just stay unassigned). Unselected catalog
 * icons are never allocated.
 */
export function createMappingState(
  catalog: IconCatalog,
  selectedIds: readonly string[],
): MappingResult {
  const index = indexIconCatalog(catalog);
  const errors: MappingIssue[] = [];
  const slots: MappingSlot[] = [];

  for (const id of selectedIds) {
    const icon = index.byId.get(id);
    if (!icon) {
      errors.push({
        code: "UNKNOWN_ICON_ID",
        severity: "error",
        message: `unknown icon id "${id}"`,
        iconId: id,
      });
      continue;
    }
    slots.push({ icon, assignedSource: undefined });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: slots };
}

/**
 * Assign a source to an icon slot. The ID must exist and be selected; a new
 * source only replaces the prior assignment after passing ingestion validation
 * (the caller supplies `validated`). On validation failure the prior assignment
 * is retained.
 */
export function assignSvg(
  state: MappingState,
  iconId: string,
  source: SvgSource,
  options: { validate?: (source: SvgSource) => boolean } = {},
): MappingResult {
  const slotIndex = state.findIndex((slot) => slot.icon.id === iconId);
  if (slotIndex === -1) {
    return {
      ok: false,
      errors: [{ code: "UNKNOWN_OR_UNSELECTED", severity: "error", message: `icon "${iconId}" is not in the selection`, iconId }],
    };
  }

  const validator = options.validate;
  if (validator && !validator(source)) {
    return {
      ok: false,
      errors: [{ code: "VALIDATION_FAILED", severity: "error", message: `source for "${iconId}" failed validation; prior assignment retained`, iconId }],
    };
  }

  const next = state.map((slot, i) =>
    i === slotIndex ? { ...slot, assignedSource: source.name } : slot,
  );
  return { ok: true, value: next };
}

/** Remove an assignment; slot returns to unassigned. */
export function unassignSvg(state: MappingState, iconId: string): MappingResult {
  const slotIndex = state.findIndex((slot) => slot.icon.id === iconId);
  if (slotIndex === -1) {
    return {
      ok: false,
      errors: [{ code: "UNKNOWN_OR_UNSELECTED", severity: "error", message: `icon "${iconId}" is not in the selection`, iconId }],
    };
  }
  const next = state.map((slot, i) =>
    i === slotIndex ? { ...slot, assignedSource: undefined } : slot,
  );
  return { ok: true, value: next };
}

export interface MappingProgress {
  readonly selected: number;
  readonly filled: number;
  readonly missing: number;
  readonly valid: number;
  readonly warnings: number;
  readonly errors: number;
}

/**
 * Compute counts from state, never from UI counters.
 */
export function getMappingProgress(state: MappingState): MappingProgress {
  let filled = 0;
  for (const slot of state) {
    if (slot.assignedSource !== undefined) filled += 1;
  }
  return {
    selected: state.length,
    filled,
    missing: state.length - filled,
    valid: filled,
    warnings: 0,
    errors: 0,
  };
}

export function listMappingIssues(state: MappingState): MappingIssue[] {
  const issues: MappingIssue[] = [];
  for (const slot of state) {
    if (slot.assignedSource === undefined) {
      issues.push({
        code: "MISSING_ICON",
        severity: "warning",
        message: `no source assigned for "${slot.icon.id}"`,
        iconId: slot.icon.id,
      });
    }
  }
  return issues;
}

export interface MappingFormEntry {
  readonly iconId: string;
  readonly file: string;
}

export type MappingFormResult =
  | { readonly ok: true; readonly value: MappingFormEntry[] }
  | { readonly ok: false; readonly errors: MappingIssue[] };

/**
 * Validate an external JSON mapping form (used by website/action embedding).
 * Rejects path fields in browser mode; ensures every mapping targets one
 * selected canonical ID.
 */
export function parseMappingForm(
  input: unknown,
  options: { browserMode?: boolean } = {},
): MappingFormResult {
  const errors: MappingIssue[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      ok: false,
      errors: [{ code: "NOT_OBJECT", severity: "error", message: "mapping form must be an object" }],
    };
  }

  const entries: MappingFormEntry[] = [];
  const record = input as Record<string, unknown>;
  const mappings = record.mappings;
  if (!Array.isArray(mappings)) {
    return {
      ok: false,
      errors: [{ code: "MISSING_MAPPINGS", severity: "error", message: "mappings must be an array" }],
    };
  }

  const seen = new Set<string>();
  mappings.forEach((entry, i) => {
    const path = `mappings[${i}]`;
    if (typeof entry !== "object" || entry === null) {
      errors.push({ code: "INVALID_MAPPING", severity: "error", message: `${path}: must be an object`, path });
      return;
    }
    const e = entry as Record<string, unknown>;
    const iconId = e.iconId;
    const file = e.file;
    if (typeof iconId !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(iconId)) {
      errors.push({ code: "INVALID_ICON_ID", severity: "error", message: `${path}.iconId invalid`, path });
    } else if (seen.has(iconId)) {
      errors.push({ code: "DUPLICATE_TARGET", severity: "error", message: `${path}: duplicate target "${iconId}"`, path });
    } else {
      seen.add(iconId);
    }

    if (typeof file !== "string" || file.length === 0) {
      errors.push({ code: "MISSING_FILE", severity: "error", message: `${path}.file is required`, path });
    } else if (options.browserMode && (file.includes("/") || file.includes("\\") || file.includes(".."))) {
      errors.push({ code: "FORBIDDEN_PATH", severity: "error", message: `${path}.file must be an opaque browser file id in browser mode`, path });
    }

    if (typeof iconId === "string" && typeof file === "string" && !errors.some((e2) => e2.path === path)) {
      entries.push({ iconId, file });
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: entries };
}
