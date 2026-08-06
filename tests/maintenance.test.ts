import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  cmdAdd,
  cmdUpdate,
  cmdDeprecate,
  cmdRemove,
} from "../src/catalog/maintenance";
import { serializeCatalog } from "../src/catalog/serialize";
import type { IconCatalog, IconDefinition } from "../src/contracts/types";

let dir: string;
let catalogPath: string;
let originalBytes: string;

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
      aliases: [],
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "catalog-maint-"));
  catalogPath = join(dir, "catalog.json");
  originalBytes = serializeCatalog(base);
  writeFileSync(catalogPath, originalBytes, "utf8");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("catalog maintenance commands", () => {
  it("add writes atomically", () => {
    const result = cmdAdd(catalogPath, newIcon);
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(readFileSync(catalogPath, "utf8"));
    expect(parsed.icons.map((i: { id: string }) => i.id)).toContain("symbol-check");
  });

  it("dry-run does not write", () => {
    const result = cmdAdd(catalogPath, newIcon, { dryRun: true });
    expect(result.ok).toBe(true);
    expect(readFileSync(catalogPath, "utf8")).toBe(originalBytes);
    expect(existsSync(`${catalogPath}.tmp`)).toBe(false);
  });

  it("invalid operation leaves catalog byte-identical", () => {
    const first = base.icons[0];
    if (!first) throw new Error("fixture missing");
    const result = cmdAdd(catalogPath, first);
    expect(result.ok).toBe(false);
    expect(readFileSync(catalogPath, "utf8")).toBe(originalBytes);
  });

  it("update preserves unrelated fields and formatting", () => {
    const result = cmdUpdate(catalogPath, "user-circle", { label: "User avatar" });
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(readFileSync(catalogPath, "utf8"));
    const updated = parsed.icons.find((i: { id: string }) => i.id === "user-circle");
    expect(updated.label).toBe("User avatar");
    expect(updated.referenceIcon).toBe("arrow-chevron-right");
  });

  it("remove with replacement rewrites references", () => {
    const result = cmdRemove(catalogPath, "arrow-chevron-right", "user-circle");
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(readFileSync(catalogPath, "utf8"));
    expect(parsed.icons).toHaveLength(1);
    const updated = parsed.icons[0];
    expect(updated.id).toBe("user-circle");
    expect(updated.referenceIcon).toBe("user-circle");
  });

  it("deprecate is a no-op marker that keeps the file", () => {
    const result = cmdDeprecate(catalogPath, "user-circle");
    expect(result.ok).toBe(true);
    expect(JSON.parse(readFileSync(catalogPath, "utf8")).icons).toHaveLength(2);
  });
});
