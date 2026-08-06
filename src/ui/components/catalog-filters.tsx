import { useMemo, useState } from "react";
import type { IconCatalog } from "../../contracts/types";

/**
 * CatalogFilters calls the injected search callback; it must not reimplement
 * search. Keyboard-friendly: input has an accessible label and a clear button.
 */
export function CatalogFilters({
  onSearch,
  subgroup,
  onSubgroupChange,
  catalog,
}: {
  onSearch: (query: string) => void;
  subgroup: string | undefined;
  onSubgroupChange: (subgroup: string | undefined) => void;
  catalog: IconCatalog;
}) {
  const [query, setQuery] = useState("");

  const subgroups = useMemo(() => {
    const set = new Set<string>();
    for (const icon of catalog.icons) set.add(icon.subgroupId);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [catalog]);

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
    </div>
  );
}
