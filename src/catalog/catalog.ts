import {
  type IconCatalog,
  type IconDefinition,
  type CatalogIndex,
  ICON_CATALOG_SCHEMA_VERSION,
} from "../contracts/types";

/**
 * A contract issue: stable code, severity, and a human-readable message.
 * Machine-readable detail is carried in the `detail` field.
 */
export interface ContractIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly path?: string;
  readonly detail?: unknown;
}

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: E[] };

const RE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RESERVED_IDS = new Set([
  "theme",
  "style",
  "registry",
  "provider",
  "types",
  "index",
  "icon",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isIsoDate(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validateId(id: unknown, path: string): ContractIssue[] {
  const issues: ContractIssue[] = [];
  if (typeof id !== "string") {
    return [{ code: "INVALID_TYPE", severity: "error", message: `${path}: id must be a string`, path }] as const;
  }
  if (!RE_ID.test(id)) {
    issues.push({
      code: "INVALID_ICON_ID",
      severity: "error",
      message: `${path}: icon id must match lowercase kebab-case`,
      path,
    });
  }
  if (id.length < 2 || id.length > 64) {
    issues.push({
      code: "INVALID_ICON_ID_LENGTH",
      severity: "error",
      message: `${path}: icon id length must be 2..64`,
      path,
    });
  }
  if (RESERVED_IDS.has(id)) {
    issues.push({
      code: "RESERVED_ICON_ID",
      severity: "error",
      message: `${path}: "${id}" is a reserved id`,
      path,
    });
  }
  return issues;
}

/**
 * Parse and runtime-validate an unknown value as an IconCatalog. Returns issues
 * instead of throwing for user data. Rejects unknown future major versions.
 */
export function parseIconCatalog(input: unknown): Result<IconCatalog, ContractIssue> {
  const issues: ContractIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [{ code: "NOT_OBJECT", severity: "error", message: "catalog must be an object" }],
    };
  }

  const schemaVersion = input.schemaVersion;
  if (typeof schemaVersion !== "number") {
    issues.push({ code: "MISSING_SCHEMA_VERSION", severity: "error", message: "schemaVersion is required" });
  } else if (schemaVersion !== ICON_CATALOG_SCHEMA_VERSION) {
    issues.push({
      code: "UNSUPPORTED_SCHEMA_VERSION",
      severity: "error",
      message: `unsupported schema version ${String(schemaVersion)}`,
      detail: { supported: ICON_CATALOG_SCHEMA_VERSION },
    });
  }

  if (!Array.isArray(input.icons)) {
    issues.push({ code: "MISSING_ICONS", severity: "error", message: "icons must be an array" });
    return { ok: false, errors: issues };
  }

  const seenIds = new Set<string>();
  const seenAliases = new Set<string>();
  const icons: IconDefinition[] = [];

  input.icons.forEach((entry, i) => {
    const path = `icons[${i}]`;
    if (!isRecord(entry)) {
      issues.push({ code: "INVALID_ICON_ENTRY", severity: "error", message: `${path}: must be an object`, path });
      return;
    }

    const id = entry.id;
    issues.push(...validateId(id, `${path}.id`));
    if (typeof id === "string") {
      if (seenIds.has(id)) {
        issues.push({ code: "DUPLICATE_ICON_ID", severity: "error", message: `${path}: duplicate icon id "${id}"`, path });
      }
      seenIds.add(id);
    }

    if (typeof entry.subgroupId !== "string" || !RE_ID.test(entry.subgroupId)) {
      issues.push({ code: "INVALID_SUBGROUP_ID", severity: "error", message: `${path}.subgroupId must be lowercase kebab-case`, path });
    }

    if (typeof entry.label !== "string" || entry.label.length === 0) {
      issues.push({ code: "MISSING_LABEL", severity: "error", message: `${path}.label is required`, path });
    }

    if (entry.aliases !== undefined) {
      if (!isStringArray(entry.aliases)) {
        issues.push({ code: "INVALID_ALIASES", severity: "error", message: `${path}.aliases must be string[]`, path });
      } else {
        for (const alias of entry.aliases) {
          if (seenAliases.has(alias)) {
            issues.push({ code: "DUPLICATE_ALIAS", severity: "error", message: `${path}: duplicate alias "${alias}"`, path });
          }
          seenAliases.add(alias);
        }
      }
    }

    if (entry.referenceIcon !== undefined && typeof entry.referenceIcon !== "string") {
      issues.push({ code: "INVALID_REFERENCE", severity: "error", message: `${path}.referenceIcon must be a string`, path });
    }

    if (typeof entry.addedAt !== "string" || !isIsoDate(entry.addedAt)) {
      issues.push({ code: "INVALID_ADDED_AT", severity: "error", message: `${path}.addedAt must be ISO 8601`, path });
    }
    if (typeof entry.updatedAt !== "string" || !isIsoDate(entry.updatedAt)) {
      issues.push({ code: "INVALID_UPDATED_AT", severity: "error", message: `${path}.updatedAt must be ISO 8601`, path });
    }

    if (issues.every((issue) => issue.path !== path && !issue.path?.startsWith(`${path}.`))) {
      icons.push({
        id: String(entry.id),
        subgroupId: String(entry.subgroupId),
        label: String(entry.label),
        aliases: isStringArray(entry.aliases) ? entry.aliases : [],
        ...(entry.referenceIcon !== undefined
          ? { referenceIcon: String(entry.referenceIcon) }
          : {}),
        addedAt: String(entry.addedAt),
        updatedAt: String(entry.updatedAt),
      });
    }
  });

  if (issues.length > 0) {
    return { ok: false, errors: issues };
  }

  return {
    ok: true,
    value: { schemaVersion: schemaVersion as number, icons },
  };
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

/**
 * Build lookup maps by icon/subgroup and normalized search tokens.
 * Canonical IDs are never modified.
 */
export function indexIconCatalog(catalog: IconCatalog): CatalogIndex {
  const byId = new Map<string, IconDefinition>();
  const bySubgroup = new Map<string, IconDefinition[]>();
  const byToken = new Map<string, Set<string>>();
  const order: string[] = [];

  for (const icon of catalog.icons) {
    byId.set(icon.id, icon);
    order.push(icon.id);

    const subgroupEntries = bySubgroup.get(icon.subgroupId) ?? [];
    subgroupEntries.push(icon);
    bySubgroup.set(icon.subgroupId, subgroupEntries);

    const tokens = new Set<string>();
    tokens.add(normalizeToken(icon.id));
    tokens.add(normalizeToken(icon.label));
    for (const alias of icon.aliases) tokens.add(normalizeToken(alias));
    for (const segment of icon.id.split("-")) tokens.add(segment);
    for (const token of tokens) {
      const ids = byToken.get(token) ?? new Set<string>();
      ids.add(icon.id);
      byToken.set(token, ids);
    }
  }

  const stableByToken = new Map<string, readonly string[]>();
  for (const [token, ids] of byToken) {
    stableByToken.set(token, [...ids].sort());
  }
  const stableBySubgroup = new Map<string, readonly IconDefinition[]>();
  for (const [sub, defs] of bySubgroup) {
    stableBySubgroup.set(sub, [...defs].sort((a, b) => a.id.localeCompare(b.id)));
  }

  return {
    byId,
    bySubgroup: stableBySubgroup,
    byToken: stableByToken,
    order,
  };
}

/**
 * Search the catalog. Trims and case-folds only the query text; canonical IDs
 * remain byte-for-byte unchanged. Empty query returns the filtered stable catalog.
 */
export function searchIcons(
  index: CatalogIndex,
  query: string,
  subgroupId?: string,
): IconDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") {
    return subgroupId
      ? [...(index.bySubgroup.get(subgroupId) ?? [])]
      : index.order.map((id) => index.byId.get(id) as IconDefinition);
  }

  const queryTokens = normalized.split(/[\s-]+/).filter((t) => t.length > 0);
  const matches = new Set<string>();

  for (const token of queryTokens) {
    const ids = index.byToken.get(token);
    if (ids) for (const id of ids) matches.add(id);
    // prefix match on id and label
    for (const defs of index.bySubgroup.values()) {
      for (const def of defs) {
        if (def.id.startsWith(token) || def.label.toLowerCase().includes(normalized)) {
          matches.add(def.id);
        }
      }
    }
  }

  const result = index.order.filter((id) => matches.has(id));
  return subgroupId
    ? result
        .map((id) => index.byId.get(id) as IconDefinition)
        .filter((def) => def.subgroupId === subgroupId)
    : result.map((id) => index.byId.get(id) as IconDefinition);
}
