import type { IconDefinition } from "../contracts/types";
import type { ValidationIssue } from "../svg/parse";
import type { MappingState } from "../mapping/mapping";

/**
 * Icon-slot view model: derives a per-icon status (selected/missing/valid/
 * warning/error) from session state as a pure function. UI never recomputes
 * authoritative status; it consumes these models.
 */

export type IconSlotStatus = "unselected" | "missing" | "valid" | "warning" | "error";

export interface IconSlotViewModel {
  readonly icon: IconDefinition;
  readonly status: IconSlotStatus;
  /** Validation issues for this icon (empty when none). */
  readonly issues: readonly ValidationIssue[];
}

/** Issues keyed by icon id; independent per icon, never a global override. */
export type ValidationByIcon = ReadonlyMap<string, readonly ValidationIssue[]>;

/**
 * Derive view models for every catalog icon. Status precedence:
 * error > warning > valid > missing > unselected.
 */
export function deriveIconSlotViewModels(
  catalog: { readonly icons: readonly IconDefinition[] },
  assignments: MappingState,
  validationByIcon: ValidationByIcon,
): IconSlotViewModel[] {
  const assigned = new Set(
    assignments.filter((slot) => slot.assignedSource !== undefined).map((slot) => slot.icon.id),
  );

  return catalog.icons.map((icon) => {
    const issues = validationByIcon.get(icon.id) ?? [];
    const hasError = issues.some((issue) => issue.severity === "error");
    const hasWarning = issues.some((issue) => issue.severity === "warning");

    let status: IconSlotStatus;
    if (hasError) status = "error";
    else if (hasWarning) status = "warning";
    else if (assigned.has(icon.id)) status = "valid";
    else if (assigned.has(icon.id) === false && issues.length === 0) {
      // selected but no assignment = missing; not selected = unselected
      status = assignments.some((slot) => slot.icon.id === icon.id) ? "missing" : "unselected";
    } else {
      status = "unselected";
    }

    return { icon, status, issues };
  });
}

/** Filter view models by a status predicate (AND-composed by the caller). */
export function filterByStatuses(
  models: readonly IconSlotViewModel[],
  statuses: readonly IconSlotStatus[],
): IconSlotViewModel[] {
  const set = new Set(statuses);
  if (set.size === 0) return [...models];
  return models.filter((model) => set.has(model.status));
}
