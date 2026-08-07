import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

const VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
const EMPTY_SVG = "<svg></svg>";

describe("PMUI-09 icon status, navigation, and slot controls", () => {
  it("remove slot removes assignment and selection, counts go to zero", async () => {
    const user = userEvent.setup();
    render(<MakerApp catalog={catalog(3)} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([VALID_SVG], "custom.svg", { type: "image/svg+xml" }));
    await screen.findByText("custom.svg");

    const strip = () => document.querySelector(".progress-strip")?.textContent ?? "";
    expect(strip()).toContain("1 selected");
    expect(strip()).toContain("1 filled");

    fireEvent.click(screen.getByLabelText("Remove from group icon-000"));
    expect(strip()).toContain("0 selected");
    expect(strip()).toContain("0 filled");
    expect(screen.getByTestId("status-icon-000")).toHaveTextContent("empty");
  });

  it("remove assignment keeps the slot selected (missing); remove slot removes it", async () => {
    const user = userEvent.setup();
    render(<MakerApp catalog={catalog(3)} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([VALID_SVG], "custom.svg", { type: "image/svg+xml" }));
    await screen.findByTestId("status-icon-000");
    // wait for the async assignment to land
    await screen.findByText("custom.svg");

    fireEvent.click(screen.getByLabelText("Remove icon-000"));
    const strip = () => document.querySelector(".progress-strip")?.textContent ?? "";
    expect(strip()).toContain("1 selected");
    expect(strip()).toContain("0 filled");
  });

  it("status filter combines AND with search", async () => {
    const user = userEvent.setup();
    render(<MakerApp catalog={catalog(6)} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([VALID_SVG], "custom.svg", { type: "image/svg+xml" }));

    // filter to "valid" only — the one filled icon (icon-000) stays
    fireEvent.click(screen.getByRole("checkbox", { name: "valid" }));
    const shown = () =>
      document.querySelectorAll("[data-testid^='icon-card-']").length;
    expect(shown()).toBe(1);

    // add a search with no matches: AND -> 0 results
    const search = screen.getByLabelText("Search icons");
    await user.type(search, "zzzz-no-match");
    expect(shown()).toBe(0);
  });

  it("validation errors from two icons are isolated (no global overwrite)", async () => {
    const user = userEvent.setup();
    render(<MakerApp catalog={catalog(2)} />);

    // empty SVG assigns to icon-000 and produces a validation error issue
    const input0 = document.querySelector('[data-testid^="icon-card-icon-000"] input[type="file"]') as HTMLInputElement;
    await user.upload(input0, new File([EMPTY_SVG], "bad.svg", { type: "image/svg+xml" }));
    await new Promise((r) => setTimeout(r, 50));

    // valid SVG assigns to icon-001 via its own input
    const input1 = document.querySelector('[data-testid^="icon-card-icon-001"] input[type="file"]') as HTMLInputElement;
    await user.upload(input1, new File([VALID_SVG], "good.svg", { type: "image/svg+xml" }));
    await new Promise((r) => setTimeout(r, 50));

    // both assigned
    expect(screen.getByTestId("status-icon-000")).toHaveTextContent("bad.svg");
    expect(screen.getByTestId("status-icon-001")).toHaveTextContent("good.svg");

    // review shows the empty-svg error for icon-000, and icon-001 has no error
    await user.click(screen.getByRole("tab", { name: "review" }));
    const issues = Array.from(document.querySelectorAll(".review-issues li")).map((li) =>
      li.textContent ?? "",
    );
    expect(issues.some((t) => t.includes("EMPTY_DRAWABLE_CONTENT"))).toBe(true);
    expect(issues.some((t) => t.includes("good.svg"))).toBe(false);
  });

  it("go-to-icon from review returns to catalog", async () => {
    const user = userEvent.setup();
    render(<MakerApp catalog={catalog(3)} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([EMPTY_SVG], "bad.svg", { type: "image/svg+xml" }));
    await new Promise((r) => setTimeout(r, 50));

    await user.click(screen.getByRole("tab", { name: "review" }));
    const goBtn = screen.getAllByRole("button", { name: /go to icon icon-000/i })[0];
    expect(goBtn).toBeTruthy();

    fireEvent.click(goBtn as HTMLElement);
    expect(screen.getByTestId("virtualized-grid")).toBeTruthy();
  });
});
