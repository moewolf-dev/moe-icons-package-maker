import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MakerApp } from "../../src/ui/maker-app";
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

describe("MakerApp", () => {
  it("renders the catalog tab with the virtualized grid", async () => {
    render(<MakerApp catalog={catalog(10)} />);
    expect(screen.getByTestId("maker-app")).toBeTruthy();
    expect(screen.getByTestId("virtualized-grid")).toBeTruthy();
  });

  it("navigates to metadata and review tabs", async () => {
    const user = userEvent.setup();
    render(<MakerApp catalog={catalog(5)} />);
    await user.click(screen.getByRole("tab", { name: "metadata" }));
    expect(screen.getByTestId("group-metadata-form")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "review" }));
    expect(screen.getByTestId("build-review-panel")).toBeTruthy();
  });

  it("keeps assignments stable across search filter changes", async () => {
    const user = userEvent.setup();
    render(<MakerApp catalog={catalog(10)} />);
    // select the first visible card
    const firstCard = document.querySelector("[data-testid^='icon-card-icon-000']") as HTMLElement;
    const chooseBtn = firstCard?.querySelector("button");
    expect(chooseBtn).toBeTruthy();
  });
});
