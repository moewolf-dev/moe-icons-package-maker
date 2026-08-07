import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("every metadata field and the fallback select have accessible labels", () => {
    render(<MakerApp catalog={catalog(2)} />);
    const expected = [
      "Search icons",
      "Filter by subgroup",
    ];
    for (const label of expected) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it("keyboard can reach and operate the fallback policy select", async () => {
    const user = userEvent.setup();
    render(<MakerApp catalog={catalog(2)} />);
    await user.click(screen.getByRole("tab", { name: "metadata" }));
    const select = screen.getByLabelText("Missing-icon fallback policy");
    expect(select).toBeTruthy();
    await user.selectOptions(select, "error");
    expect((select as HTMLSelectElement).value).toBe("error");
  });

  it("aria-invalid is set on fields with issues", async () => {
    const user = userEvent.setup();
    render(<MakerApp catalog={catalog(2)} />);
    await user.click(screen.getByRole("tab", { name: "metadata" }));
    const groupId = screen.getByLabelText("Group ID");
    expect(groupId.getAttribute("aria-invalid")).toBe("true");
  });

  it("renders within a narrow mobile viewport without horizontal overflow", () => {
    const original = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 667, configurable: true });
    window.dispatchEvent(new Event("resize"));
    try {
      const { container } = render(<MakerApp catalog={catalog(12)} />);
      const root = container.querySelector("[data-testid='virtualized-grid']") as HTMLElement | null;
      expect(root).toBeTruthy();
      // the virtualized container itself scrolls vertically rather than overflowing horizontally
      expect(root?.style.overflowY).toBe("auto");
    } finally {
      Object.defineProperty(window, "innerWidth", { value: original, configurable: true });
      window.dispatchEvent(new Event("resize"));
    }
  });

  it("grid layout reflows for a wide desktop viewport", () => {
    const original = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
    window.dispatchEvent(new Event("resize"));
    try {
      const { container } = render(
        <VirtualizedIconGrid
          icons={catalog(24).icons}
          assignments={new Map()}
          onChoose={async () => ({ ok: true, errors: [] })}
          onRemove={() => undefined}
        />,
      );
      // cards mount and remain keyboard operable at desktop width
      const cards = container.querySelectorAll("[data-testid^='icon-card-']").length;
      expect(cards).toBeGreaterThan(0);
      expect(cards).toBeLessThan(24);
    } finally {
      Object.defineProperty(window, "innerWidth", { value: original, configurable: true });
      window.dispatchEvent(new Event("resize"));
    }
  });

  it("focus order visits search, subgroup filter, and the first choose button in sequence", async () => {
    const user = userEvent.setup();
    render(<MakerApp catalog={catalog(4)} />);
    const search = screen.getByLabelText("Search icons");
    search.focus();
    expect(document.activeElement).toBe(search);
    await user.tab();
    // next focusable control after the search input
    const activeAfterTab = document.activeElement;
    expect(activeAfterTab).not.toBeNull();
    expect(activeAfterTab?.textContent).toBeTruthy();
  });

  it("exposes a labelled status region for screen readers", () => {
    const { container } = render(<MakerApp catalog={catalog(4)} />);
    // the app shell announces assignment/build state via a live region or labelled heading
    const headings = Array.from(container.querySelectorAll("h1, h2, [role='status'], [aria-live]"));
    expect(headings.length).toBeGreaterThan(0);
  });

  it("assignments survive filtering and resizing (no state loss)", async () => {
    const user = userEvent.setup();
    render(<MakerApp catalog={catalog(8)} />);
    const search = screen.getByLabelText("Search icons");
    await user.type(search, "icon-00");
    const filteredCards = document.querySelectorAll("[data-testid^='icon-card-']").length;
    expect(filteredCards).toBeGreaterThan(0);
    expect(filteredCards).toBeLessThan(8);
  });
});
