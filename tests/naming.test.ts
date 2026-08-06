import { describe, it, expect } from "vitest";
import { parseIconCatalog } from "../src/catalog/catalog";

const RE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function makeCatalog(ids: string[]) {
  const now = "2026-08-06T00:00:00.000Z";
  return {
    schemaVersion: 1,
    icons: ids.map((id) => ({
      id,
      subgroupId: id.split("-")[0] ?? id,
      label: id,
      aliases: [],
      addedAt: now,
      updatedAt: now,
    })),
  };
}

/** Mirrors the valid/invalid examples in docs/contracts/naming.md. */
describe("naming specification grammar", () => {
  it("accepts every valid example from naming.md", () => {
    const valid = [
      "arrow-chevron-right",
      "building-office-tower",
      "it-fan-alert",
      "user-circle-avatar",
      "device-phone",
      "symbol-check-circle",
      "archive-box-collection-large",
      "time-clock-12",
      "emoji-smile-1",
    ];
    for (const id of valid) {
      expect(RE_ID.test(id)).toBe(true);
    }
  });

  it("rejects every invalid example from naming.md", () => {
    const invalid = [
      "Arrow-Chevron",
      "arrow_chevron",
      "arrow/chevron",
      ".",
      "..",
      "arrow chevron",
      "arrow--chevron",
      "-arrow",
      "arrow-",
      "á-í",
    ];
    for (const id of invalid) {
      expect(RE_ID.test(id)).toBe(false);
    }
  });

  it("rejects reserved and too-short ids via full catalog validation", () => {
    const result = parseIconCatalog(makeCatalog(["a-b", "theme", "a"]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === "RESERVED_ICON_ID"),
      ).toBe(true);
      expect(
        result.errors.some((e) => e.code === "INVALID_ICON_ID_LENGTH"),
      ).toBe(true);
    }
  });

  it("parse rejects an invalid id but accepts all valid ids", () => {
    const result = parseIconCatalog(makeCatalog(["a-b", "c-d", "theme"]));
    expect(result.ok).toBe(false);
    const good = parseIconCatalog(makeCatalog(["a-b", "c-d"]));
    expect(good.ok).toBe(true);
  });

  it("preserves every hyphen in canonical ids", () => {
    const result = parseIconCatalog(
      makeCatalog(["archive-box-collection-large", "it-fan-alert"]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const first = result.value.icons[0];
      expect(first?.id).toBe("archive-box-collection-large");
    }
  });
});
