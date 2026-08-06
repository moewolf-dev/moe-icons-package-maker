import { describe, it, expect } from "vitest";
import {
  addCatalogIcon,
  updateCatalogIcon,
  deprecateCatalogIcon,
  removeCatalogIcon,
} from "../src/catalog/mutate";
import { serializeCatalog } from "../src/catalog/serialize";
import type { IconCatalog, IconDefinition } from "../src/contracts/types";

const base: IconCatalog = {
  schemaVersion: 1,
  icons: [
    {
      id: "arrow-chevron-right",
      subgroupId: "arrow",
      label: "Arrow chevron right",
      aliases: ["chevron-right"],
      addedAt: "2026-08-06T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
    },
    {
      id: "user-circle",
      subgroupId: "user",
      label: "User circle",
      aliases: ["avatar"],
      addedAt: "2026-08-06T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
      referenceIcon: "arrow-chevron-right",
    },
  ],
};

const newIcon: IconDefinition = {
  id: "symbol-check",
  subgroupId: "symbol",
  label: "Symbol check",
  aliases: ["check-mark"],
  addedAt: "2026-08-06T00:00:00.000Z",
  updatedAt: "2026-08-06T00:00:00.000Z",
};

describe("addCatalogIcon", () => {
  it("adds a new icon without mutating input", () => {
    const inputJson = JSON.stringify(base);
    const result = addCatalogIcon(base, newIcon);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.catalog.icons).toHaveLength(3);
      expect(result.catalog.icons.map((i) => i.id)).toContain("symbol-check");
    }
    expect(JSON.stringify(base)).toBe(inputJson);
  });

  it("rejects a duplicate id", () => {
    const first = base.icons[0];
    if (!first) throw new Error("fixture missing");
    const result = addCatalogIcon(base, first);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "DUPLICATE_ICON_ID")).toBe(true);
  });

  it("rejects an alias collision (case-folded)", () => {
    const clash: IconDefinition = { ...newIcon, id: "symbol-check", aliases: ["CHEVRON-RIGHT"] };
    const result = addCatalogIcon(base, clash);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "DUPLICATE_ALIAS")).toBe(true);
  });

  it("rejects an invalid id", () => {
    const bad = { ...newIcon, id: "Bad_ID" };
    const result = addCatalogIcon(base, bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "INVALID_ICON_ID")).toBe(true);
  });
});

describe("updateCatalogIcon", () => {
  it("updates fields immutably", () => {
    const result = updateCatalogIcon(base, "user-circle", { label: "User avatar circle" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.catalog.icons.find((i) => i.id === "user-circle")?.label).toBe(
        "User avatar circle",
      );
    }
    expect(base.icons.find((i) => i.id === "user-circle")?.label).toBe("User circle");
  });

  it("rejects unknown id", () => {
    const result = updateCatalogIcon(base, "nope", { label: "x" });
    expect(result.ok).toBe(false);
  });

  it("rejects a collision", () => {
    const result = updateCatalogIcon(base, "user-circle", {
      aliases: ["chevron-right"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "COLLISION")).toBe(true);
  });
});

describe("deprecateCatalogIcon", () => {
  it("is a no-op marker that keeps the catalog", () => {
    const result = deprecateCatalogIcon(base, "user-circle");
    expect(result.ok).toBe(true);
  });

  it("rejects unknown id", () => {
    const result = deprecateCatalogIcon(base, "nope");
    expect(result.ok).toBe(false);
  });
});

describe("removeCatalogIcon", () => {
  it("removes an unreferenced icon", () => {
    const result = removeCatalogIcon(base, "user-circle");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.catalog.icons).toHaveLength(1);
  });

  it("refuses to remove a referenced icon without replacementId", () => {
    const result = removeCatalogIcon(base, "arrow-chevron-right");
    // arrow-chevron-right is referenced by user-circle.referenceIcon
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "STILL_REFERENCED")).toBe(true);
    }
  });

  it("removes with replacementId and rewrites references", () => {
    const result = removeCatalogIcon(base, "arrow-chevron-right", "user-circle");
    expect(result.ok).toBe(true);
  });

  it("rejects removal of unknown id", () => {
    const result = removeCatalogIcon(base, "nope");
    expect(result.ok).toBe(false);
  });
});

describe("serializeCatalog", () => {
  it("is byte-identical across repeated calls", () => {
    const a = serializeCatalog(base);
    const b = serializeCatalog(base);
    expect(a).toBe(b);
  });

  it("round-trips through parse", async () => {
    const { parseIconCatalog } = await import("../src/catalog/catalog");
    const parsed = parseIconCatalog(JSON.parse(serializeCatalog(base)));
    expect(parsed.ok).toBe(true);
  });

  it("ends with a newline", () => {
    expect(serializeCatalog(base).endsWith("\n")).toBe(true);
  });
});
