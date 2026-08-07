import { describe, it, expect } from "vitest";
import { parseIconCatalog, indexIconCatalog } from "../src/catalog/catalog";
import { deprecateCatalogIcon } from "../src/catalog/mutate";
import type { IconDefinition } from "../src/contracts/types";

function icon(id: string, extra: Partial<IconDefinition> = {}): IconDefinition {
  return {
    id,
    subgroupId: id.split("-")[0] ?? id,
    label: id,
    aliases: [],
    addedAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
    ...extra,
  };
}

const CATALOG = {
  schemaVersion: 1,
  icons: [icon("a-old"), icon("b-new"), icon("c-old")],
};

describe("PMC-01 catalog deprecation and replacement", () => {
  it("accepts a legacy catalog with no new fields", () => {
    const parsed = parseIconCatalog(CATALOG);
    expect(parsed.ok).toBe(true);
  });

  it("accepts deprecatedAt/replacedBy/migrationNote fields", () => {
    const catalog = {
      schemaVersion: 1,
      icons: [
        icon("a-old", { deprecatedAt: "2026-08-07T00:00:00.000Z", replacedBy: "b-new", migrationNote: "use b-new" }),
        icon("b-new"),
      ],
    };
    const parsed = parseIconCatalog(catalog);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const a = parsed.value.icons.find((i) => i.id === "a-old");
      expect(a?.deprecatedAt).toBe("2026-08-07T00:00:00.000Z");
      expect(a?.replacedBy).toBe("b-new");
    }
  });

  it("rejects a dangling replacedBy target", () => {
    const catalog = {
      schemaVersion: 1,
      icons: [icon("a-old", { replacedBy: "ghost" })],
    };
    const parsed = parseIconCatalog(catalog);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.some((e) => e.code === "REPLACED_BY_DANGLING")).toBe(true);
    }
  });

  it("rejects a self-replacement", () => {
    const catalog = {
      schemaVersion: 1,
      icons: [icon("a-old", { replacedBy: "a-old" })],
    };
    const parsed = parseIconCatalog(catalog);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.some((e) => e.code === "SELF_REPLACEMENT")).toBe(true);
    }
  });

  it("rejects a replacement cycle", () => {
    const catalog = {
      schemaVersion: 1,
      icons: [
        icon("old-one", { replacedBy: "new-two" }),
        icon("new-two", { replacedBy: "old-one" }),
      ],
    };
    const parsed = parseIconCatalog(catalog);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.some((e) => e.code === "REPLACEMENT_CYCLE")).toBe(true);
    }
  });

  it("rejects invalid deprecatedAt and replacedBy format", () => {
    const bad1 = parseIconCatalog({ schemaVersion: 1, icons: [icon("a", { deprecatedAt: "not-a-date" })] });
    expect(bad1.ok).toBe(false);
    const bad2 = parseIconCatalog({ schemaVersion: 1, icons: [icon("a", { replacedBy: "Bad_ID" })] });
    expect(bad2.ok).toBe(false);
  });

  it("deprecateCatalogIcon marks the icon and supports replacement", () => {
    const parsed = parseIconCatalog(CATALOG);
    if (!parsed.ok) throw new Error("bad catalog");
    const result = deprecateCatalogIcon(parsed.value, "a-old", { replacedBy: "b-new", migrationNote: "use b-new" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const a = result.catalog.icons.find((i) => i.id === "a-old");
      expect(a?.deprecatedAt).toBeTruthy();
      expect(a?.replacedBy).toBe("b-new");
      expect(a?.migrationNote).toBe("use b-new");
    }
  });

  it("deprecate rejects unknown replacement and double deprecation", () => {
    const parsed = parseIconCatalog(CATALOG);
    if (!parsed.ok) throw new Error("bad catalog");
    expect(deprecateCatalogIcon(parsed.value, "a-old", { replacedBy: "ghost" }).ok).toBe(false);
    expect(deprecateCatalogIcon(parsed.value, "a-old", { replacedBy: "a-old" }).ok).toBe(false);
    const once = deprecateCatalogIcon(parsed.value, "a-old");
    if (once.ok) {
      expect(deprecateCatalogIcon(once.catalog, "a-old").ok).toBe(false);
    }
  });

  it("serializes deterministically with new fields", () => {
    const parsed = parseIconCatalog(CATALOG);
    if (!parsed.ok) throw new Error("bad catalog");
    const deprecated = deprecateCatalogIcon(parsed.value, "a-old", { replacedBy: "b-new" });
    if (!deprecated.ok) throw new Error("deprecate failed");
    const a = deprecated.catalog.icons.find((i) => i.id === "a-old");
    expect(a?.deprecatedAt).toBe(a?.deprecatedAt); // stable value
    const index = indexIconCatalog(deprecated.catalog);
    expect(index.byId.has("a-old")).toBe(true);
    expect(index.byId.has("b-new")).toBe(true);
  });
});
