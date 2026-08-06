import { describe, it, expect } from "vitest";
import {
  parseIconCatalog,
  indexIconCatalog,
  searchIcons,
} from "../src/catalog/catalog";
import type { IconCatalog } from "../src/contracts/types";

const validCatalog: IconCatalog = {
  schemaVersion: 1,
  icons: [
    {
      id: "arrow-chevron-right",
      subgroupId: "arrow",
      label: "Arrow chevron right",
      aliases: ["chevron-right", "right-arrow"],
      addedAt: "2026-08-06T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
    },
    {
      id: "arrow-chevron-left",
      subgroupId: "arrow",
      label: "Arrow chevron left",
      aliases: ["chevron-left"],
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
    },
  ],
};

describe("parseIconCatalog", () => {
  it("accepts a valid catalog", () => {
    const result = parseIconCatalog(validCatalog);
    expect(result.ok).toBe(true);
  });

  it("rejects a non-object", () => {
    const result = parseIconCatalog("nope");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "NOT_OBJECT")).toBe(true);
    }
  });

  it("rejects a missing field", () => {
    const { icons, ...rest } = validCatalog;
    const result = parseIconCatalog(rest as unknown);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "MISSING_ICONS")).toBe(true);
    }
  });

  it("rejects duplicate icon IDs", () => {
    const dup = {
      ...validCatalog,
      icons: [validCatalog.icons[0], validCatalog.icons[0]],
    };
    const result = parseIconCatalog(dup);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "DUPLICATE_ICON_ID")).toBe(true);
    }
  });

  it("rejects duplicate aliases", () => {
    const dup = {
      ...validCatalog,
      icons: [
        { ...validCatalog.icons[0], aliases: ["same"] },
        { ...validCatalog.icons[1], aliases: ["same"] },
      ],
    };
    const result = parseIconCatalog(dup);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "DUPLICATE_ALIAS")).toBe(true);
    }
  });

  it("rejects unsupported version", () => {
    const bad = { ...validCatalog, schemaVersion: 999 };
    const result = parseIconCatalog(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === "UNSUPPORTED_SCHEMA_VERSION"),
      ).toBe(true);
    }
  });
});

describe("indexIconCatalog", () => {
  it("indexes by id, alias, and subgroup", () => {
    const index = indexIconCatalog(validCatalog);
    expect(index.byId.get("arrow-chevron-right")?.id).toBe("arrow-chevron-right");
    expect(index.bySubgroup.get("arrow")?.map((d) => d.id)).toContain(
      "arrow-chevron-left",
    );
    expect(index.byToken.get("avatar")).toContain("user-circle");
  });

  it("preserves stable order", () => {
    const index = indexIconCatalog(validCatalog);
    expect(index.order).toEqual([
      "arrow-chevron-right",
      "arrow-chevron-left",
      "user-circle",
    ]);
  });
});

describe("searchIcons", () => {
  it("returns the full filtered catalog for an empty query", () => {
    const index = indexIconCatalog(validCatalog);
    expect(searchIcons(index, "").length).toBe(3);
  });

  it("handles whitespace-only query", () => {
    const index = indexIconCatalog(validCatalog);
    expect(searchIcons(index, "   ").length).toBe(3);
  });

  it("finds a hyphenated ID", () => {
    const index = indexIconCatalog(validCatalog);
    const results = searchIcons(index, "arrow-chevron-right");
    expect(results.map((d) => d.id)).toContain("arrow-chevron-right");
  });

  it("finds by alias", () => {
    const index = indexIconCatalog(validCatalog);
    const results = searchIcons(index, "avatar");
    expect(results.map((d) => d.id)).toContain("user-circle");
  });

  it("returns no result for unknown query", () => {
    const index = indexIconCatalog(validCatalog);
    expect(searchIcons(index, "zzzz-not-real")).toEqual([]);
  });

  it("applies subgroup filter", () => {
    const index = indexIconCatalog(validCatalog);
    const results = searchIcons(index, "arrow", "arrow");
    expect(results.every((d) => d.subgroupId === "arrow")).toBe(true);
  });

  it("keeps canonical ID byte-for-byte in results", () => {
    const index = indexIconCatalog(validCatalog);
    const results = searchIcons(index, "ARROW-CHEVRON");
    for (const r of results) {
      expect(r.id).toBe(r.id.toLowerCase());
      expect(/[A-Z]/.test(r.id)).toBe(false);
    }
  });
});
