import {
  type IconCatalog,
  type IconDefinition,
} from "../contracts/types";
import { type ContractIssue, indexIconCatalog } from "./catalog";

export type CatalogMutationResult =
  | { readonly ok: true; readonly catalog: IconCatalog }
  | { readonly ok: false; readonly errors: ContractIssue[] };

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

function caseFold(value: string): string {
  return value.toLowerCase();
}

function validId(id: string): string | undefined {
  if (!RE_ID.test(id)) return `invalid icon id "${id}"`;
  if (id.length < 2 || id.length > 64) return `icon id length must be 2..64`;
  if (RESERVED_IDS.has(id)) return `"${id}" is a reserved id`;
  return undefined;
}

function buildError(code: string, message: string): ContractIssue {
  return { code, severity: "error", message };
}

/**
 * Pure immutable catalog mutation helpers. Every function returns a new catalog
 * (or errors) and never mutates the input.
 */

export function addCatalogIcon(
  catalog: IconCatalog,
  icon: IconDefinition,
): CatalogMutationResult {
  const index = indexIconCatalog(catalog);

  const idProblem = validId(icon.id);
  if (idProblem) return { ok: false, errors: [buildError("INVALID_ICON_ID", idProblem)] };
  if (index.byId.has(icon.id)) {
    return { ok: false, errors: [buildError("DUPLICATE_ICON_ID", `icon "${icon.id}" already exists`)] };
  }

  const usedAliases = new Set<string>();
  for (const def of catalog.icons) usedAliases.add(caseFold(def.id));
  for (const def of catalog.icons) for (const a of def.aliases) usedAliases.add(caseFold(a));

  for (const alias of icon.aliases) {
    if (usedAliases.has(caseFold(alias))) {
      return { ok: false, errors: [buildError("DUPLICATE_ALIAS", `alias "${alias}" is already in use`)] };
    }
  }
  if (usedAliases.has(caseFold(icon.id))) {
    return { ok: false, errors: [buildError("COLLISION", `icon id "${icon.id}" collides with an existing id/alias`)] };
  }

  return {
    ok: true,
    catalog: { ...catalog, icons: [...catalog.icons, icon] },
  };
}

export function updateCatalogIcon(
  catalog: IconCatalog,
  id: string,
  patch: Partial<Omit<IconDefinition, "id">>,
): CatalogMutationResult {
  const index = indexIconCatalog(catalog);
  const existing = index.byId.get(id);
  if (!existing) {
    return { ok: false, errors: [buildError("NOT_FOUND", `icon "${id}" not found`)] };
  }

  const next: IconDefinition = { ...existing, ...patch, id };
  const conflict = catalog.icons.find(
    (def) =>
      def.id !== id &&
      (caseFold(def.id) === caseFold(next.id) ||
        def.aliases.some((a) => caseFold(a) === caseFold(next.id)) ||
        next.aliases.some((a) => caseFold(a) === caseFold(def.id)) ||
        next.aliases.some((a) =>
          def.aliases.some((da) => caseFold(a) === caseFold(da)),
        )),
  );
  if (conflict) {
    return { ok: false, errors: [buildError("COLLISION", `update collides with icon "${conflict.id}"`)] };
  }

  return {
    ok: true,
    catalog: {
      ...catalog,
      icons: catalog.icons.map((def) => (def.id === id ? next : def)),
    },
  };
}

export function deprecateCatalogIcon(
  catalog: IconCatalog,
  id: string,
  options: { replacedBy?: string; migrationNote?: string } = {},
): CatalogMutationResult {
  const existing = catalog.icons.find((def) => def.id === id);
  if (!existing) {
    return { ok: false, errors: [buildError("NOT_FOUND", `icon "${id}" not found`)] };
  }
  if (existing.deprecatedAt) {
    return { ok: false, errors: [buildError("ALREADY_DEPRECATED", `icon "${id}" is already deprecated`)] };
  }

  const index = indexIconCatalog(catalog);
  const replacedBy = options.replacedBy;
  if (replacedBy !== undefined) {
    if (replacedBy === id) {
      return { ok: false, errors: [buildError("SELF_REPLACEMENT", `replacedBy cannot reference itself`)] };
    }
    if (!index.byId.has(replacedBy)) {
      return { ok: false, errors: [buildError("REPLACEMENT_NOT_FOUND", `replacement "${replacedBy}" not found`)] };
    }
  }

  const next: IconDefinition = {
    ...existing,
    deprecatedAt: new Date().toISOString(),
    ...(replacedBy !== undefined ? { replacedBy } : {}),
    ...(options.migrationNote !== undefined ? { migrationNote: options.migrationNote } : {}),
    updatedAt: new Date().toISOString(),
  };
  return {
    ok: true,
    catalog: {
      ...catalog,
      icons: catalog.icons.map((def) => (def.id === id ? next : def)),
    },
  };
}

export function removeCatalogIcon(
  catalog: IconCatalog,
  id: string,
  replacementId?: string,
): CatalogMutationResult {
  const existing = catalog.icons.find((def) => def.id === id);
  if (!existing) {
    return { ok: false, errors: [buildError("NOT_FOUND", `icon "${id}" not found`)] };
  }

  const index = indexIconCatalog(catalog);
  let replacement: IconDefinition | undefined;
  if (replacementId) {
    replacement = index.byId.get(replacementId);
    if (!replacement) {
      return { ok: false, errors: [buildError("REPLACEMENT_NOT_FOUND", `replacement "${replacementId}" not found`)] };
    }
  }

  const references = catalog.icons.filter(
    (def) => def.referenceIcon === id,
  );
  if (references.length > 0 && !replacement) {
    return {
      ok: false,
      errors: [
        buildError(
          "STILL_REFERENCED",
          `icon "${id}" is referenced by ${references.map((r) => r.id).join(", ")}; provide replacementId`,
        ),
      ],
    };
  }

  return {
    ok: true,
    catalog: {
      ...catalog,
      icons: catalog.icons
        .filter((def) => def.id !== id)
        .map((def) =>
          def.referenceIcon === id && replacement
            ? { ...def, referenceIcon: replacement.id }
            : def,
        ),
    },
  };
}
