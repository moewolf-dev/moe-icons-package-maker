import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { parseIconCatalog } from "./catalog";
import {
  addCatalogIcon,
  updateCatalogIcon,
  deprecateCatalogIcon,
  removeCatalogIcon,
} from "./mutate";
import { serializeCatalog } from "./serialize";
import type { IconCatalog, IconDefinition } from "../contracts/types";

/**
 * Catalog maintenance commands with atomic write and dry-run support.
 * Invalid operations leave the catalog file byte-identical.
 */

export interface MaintenanceResult {
  readonly ok: boolean;
  readonly message: string;
  readonly errors: string[];
}

type MutationFn = (catalog: IconCatalog) =>
  | { readonly ok: true; readonly catalog: IconCatalog }
  | { readonly ok: false; readonly errors: { message: string }[] };

function applyMutation(
  catalogPath: string,
  mutate: MutationFn,
  options: { dryRun?: boolean } = {},
): MaintenanceResult {
  const raw: unknown = JSON.parse(readFileSync(catalogPath, "utf8"));
  const parsed = parseIconCatalog(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      message: "catalog is invalid",
      errors: parsed.errors.map((e) => e.message),
    };
  }

  const result = mutate(parsed.value);
  if (!result.ok) {
    return {
      ok: false,
      message: "mutation rejected",
      errors: result.errors.map((e) => e.message),
    };
  }

  const serialized = serializeCatalog(result.catalog);
  if (options.dryRun) {
    return { ok: true, message: "dry-run: no changes written", errors: [] };
  }

  const tmp = `${catalogPath}.tmp`;
  writeFileSync(tmp, serialized, "utf8");
  renameSync(tmp, catalogPath);
  return { ok: true, message: `updated ${catalogPath}`, errors: [] };
}

export function cmdAdd(
  catalogPath: string,
  icon: IconDefinition,
  options: { dryRun?: boolean } = {},
): MaintenanceResult {
  return applyMutation(catalogPath, (c) => addCatalogIcon(c, icon), options);
}

export function cmdUpdate(
  catalogPath: string,
  id: string,
  patch: Partial<Omit<IconDefinition, "id">>,
  options: { dryRun?: boolean } = {},
): MaintenanceResult {
  return applyMutation(catalogPath, (c) => updateCatalogIcon(c, id, patch), options);
}

export function cmdDeprecate(
  catalogPath: string,
  id: string,
  options: { dryRun?: boolean } = {},
): MaintenanceResult {
  return applyMutation(catalogPath, (c) => deprecateCatalogIcon(c, id), options);
}

export function cmdRemove(
  catalogPath: string,
  id: string,
  replacementId: string | undefined,
  options: { dryRun?: boolean } = {},
): MaintenanceResult {
  return applyMutation(
    catalogPath,
    (c) => removeCatalogIcon(c, id, replacementId),
    options,
  );
}
