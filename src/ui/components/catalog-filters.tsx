import { useMemo, useState } from "react";
import type { IconCatalog } from "../../contracts/types";
import type { IconSlotStatus } from "../icon-view-model";

/**
 * CatalogFilters calls the injected search callback; it must not reimplement
 * search. Keyboard-friendly: input has an accessible label and a clear button.
 * Search, subgroup, and status filters combine with AND semantics.
 */
export function CatalogFilters({
  onSearch,
  subgroup,
  onSubgroupChange,
  catalog,
  statuses,
  onStatusesChange,
}: {
  onSearch: (query: string) => void;
  subgroup: string | undefined;
  onSubgroupChange: (subgroup: string | undefined) => void;
  catalog: IconCatalog;
  statuses?: readonly IconSlotStatus[];
  onStatusesChange?: (statuses: IconSlotStatus[]) => void;
}) {
  const [query, setQuery] = useState("");

  const subgroups = useMemo(() => {
    const set = new Set<string>();
    for (const icon of catalog.icons) set.add(icon.subgroupId);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  const allStatuses: IconSlotStatus[] = ["unselected", "missing", "valid", "warning", "error"];
  const activeStatuses = statuses ?? [];

  const toggleStatus = (status: IconSlotStatus) => {
    if (!onStatusesChange) return;
    const next = activeStatuses.includes(status)
      ? activeStatuses.filter((s) => s !== status)
      : [...activeStatuses, status];
    onStatusesChange(next);
  };

  return (
    <div className="catalog-filters">
      <label>
        <span>Search icons</span>
        <input
          type="search"
          value={query}
          aria-label="Search icons"
          onChange={(event) => {
            setQuery(event.target.value);
            onSearch(event.target.value);
          }}
          placeholder="e.g. arrow-chevron"
        />
      </label>
      <label>
        <span>Subgroup</span>
        <select
          aria-label="Filter by subgroup"
          value={subgroup ?? ""}
          onChange={(event) =>
            onSubgroupChange(event.target.value === "" ? undefined : event.target.value)
          }
        >
          <option value="">All subgroups</option>
          {subgroups.map((sub) => (
            <option key={sub} value={sub}>
              {sub}
            </option>
          ))}
        </select>
      </label>
      {onStatusesChange && (
        <fieldset className="status-filters" aria-label="Filter by icon status">
          <legend>Status</legend>
          <div className="status-options">
            {allStatuses.map((status) => (
              <label key={status}>
                <input
                  type="checkbox"
                  checked={activeStatuses.includes(status)}
                  onChange={() => toggleStatus(status)}
                />
                {status}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
