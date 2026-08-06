import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CatalogFilters } from "../../src/ui/components/catalog-filters";
import type { IconCatalog } from "../../src/contracts/types";

const catalog: IconCatalog = {
  schemaVersion: 1,
  icons: [
    { id: "arrow-chevron-right", subgroupId: "arrow", label: "Arrow", aliases: [], addedAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" },
    { id: "user-circle", subgroupId: "user", label: "User", aliases: [], addedAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" },
  ],
};

describe("CatalogFilters", () => {
  it("forwards search query to the injected callback", async () => {
    const user = userEvent.setup();
    const onSearch = (query: string) => query;
    const spy = (query: string) => queries.push(query);
    const queries: string[] = [];
    render(
      <CatalogFilters
        onSearch={spy}
        subgroup={undefined}
        onSubgroupChange={() => undefined}
        catalog={catalog}
      />,
    );
    const input = screen.getByLabelText("Search icons");
    await user.type(input, "arrow");
    expect(queries.join("")).toContain("arrow");
    expect(onSearch("x")).toBe("x");
  });

  it("renders subgroups from the catalog", () => {
    render(
      <CatalogFilters
        onSearch={() => undefined}
        subgroup={undefined}
        onSubgroupChange={() => undefined}
        catalog={catalog}
      />,
    );
    const select = screen.getByRole("combobox");
    expect(select).toBeTruthy();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toContain("arrow");
  });
});
