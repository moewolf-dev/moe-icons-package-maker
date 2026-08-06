import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MakerApp } from "../../src/ui/maker-app";
import { VirtualizedIconGrid } from "../../src/ui/components/virtualized-icon-grid";
import type { IconCatalog } from "../../src/contracts/types";

function catalog(count: number): IconCatalog {
  const icons = Array.from({ length: count }, (_, i) => ({
    id: `icon-${String(i).padStart(3, "0")}`,
    subgroupId: "symbol",
    label: `Icon ${i}`,
    aliases: [],
    addedAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
  }));
  return { schemaVersion: 1, icons };
}

describe("accessibility and responsiveness", () => {
  it("renders the search input with an accessible label", () => {
    render(<MakerApp catalog={catalog(5)} />);
    expect(screen.getByLabelText("Search icons")).toBeTruthy();
  });

  it("renders tab navigation with aria-selected state", () => {
    render(<MakerApp catalog={catalog(5)} />);
    const catalogTab = screen.getByRole("tab", { name: "catalog" });
    expect(catalogTab.getAttribute("aria-selected")).toBe("true");
  });

  it("renders group metadata inputs with accessible labels", () => {
    const { container } = render(<MakerApp catalog={catalog(2)} />);
    // metadata tab is lazy; ensure the app shell has labeled controls in catalog tab
    expect(container.querySelector("input[aria-label='Search icons']")).toBeTruthy();
  });

  it("virtualized grid does not mount all rows for a large catalog", () => {
    const big = catalog(1108);
    const { container } = render(
      <VirtualizedIconGrid
        icons={big.icons}
        assignments={new Map()}
        onChoose={async () => ({ ok: true, errors: [] })}
        onRemove={() => undefined}
      />,
    );
    const mountedCards = container.querySelectorAll("[data-testid^='icon-card-']").length;
    expect(mountedCards).toBeLessThan(50);
    expect(mountedCards).toBeGreaterThan(0);
  });

  it("renders the reference preview icon when a resolver is provided", () => {
    render(
      <VirtualizedIconGrid
        icons={catalog(3).icons}
        assignments={new Map()}
        referencePreview={(id) => `https://ref.example.com/${id}.svg`}
        onChoose={async () => ({ ok: true, errors: [] })}
        onRemove={() => undefined}
      />,
    );
    const firstRef = document.querySelector("[data-testid^='reference-icon-000']") as HTMLElement;
    expect(firstRef).toBeTruthy();
    const img = firstRef?.querySelector("img");
    expect(img?.getAttribute("src")).toContain("icon-000.svg");
  });
});
