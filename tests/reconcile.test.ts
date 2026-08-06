import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reconcileCatalog } from "../src/catalog/reconcile";

function makeFixture(iconIds: string[], extraSvg = "") {
  const root = mkdtempSync(join(tmpdir(), "reconcile-"));
  const iconsDir = join(root, "icons");
  mkdirSync(iconsDir, { recursive: true });
  for (const id of iconIds) {
    writeFileSync(
      join(iconsDir, `${id}.svg`),
      `<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>`,
    );
  }
  const now = "2026-08-06T00:00:00.000Z";
  const catalog = {
    schemaVersion: 1,
    icons: iconIds.map((id) => ({
      id,
      subgroupId: id.split("-")[0],
      label: id,
      aliases: [],
      addedAt: now,
      updatedAt: now,
    })),
  };
  const catalogPath = join(root, "catalog.json");
  writeFileSync(catalogPath, JSON.stringify(catalog));
  return { root, iconsDir, catalogPath };
}

describe("reconcileCatalog", () => {
  it("reports full match when source and catalog align", () => {
    const { root, iconsDir, catalogPath } = makeFixture(["a-b", "c-d"]);
    try {
      const result = reconcileCatalog(catalogPath, iconsDir);
      expect(result.ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags unmapped source files", () => {
    const { root, iconsDir, catalogPath } = makeFixture(["a-b"]);
    try {
      writeFileSync(join(iconsDir, "unmapped.svg"), "<svg/>");
      const result = reconcileCatalog(catalogPath, iconsDir);
      expect(result.ok).toBe(false);
      expect(result.report.some((l) => l.includes("UNMAPPED: unmapped"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags orphaned catalog ids without source", () => {
    const { root, iconsDir, catalogPath } = makeFixture(["a-b", "c-d"]);
    try {
      rmSync(join(iconsDir, "c-d.svg"));
      const result = reconcileCatalog(catalogPath, iconsDir);
      expect(result.ok).toBe(false);
      expect(result.report.some((l) => l.includes("ORPHANED: c-d"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects an invalid catalog", () => {
    const root = mkdtempSync(join(tmpdir(), "reconcile-"));
    try {
      const iconsDir = join(root, "icons");
      mkdirSync(iconsDir);
      const catalogPath = join(root, "bad.json");
      writeFileSync(catalogPath, JSON.stringify({ schemaVersion: 999, icons: [] }));
      const result = reconcileCatalog(catalogPath, iconsDir);
      expect(result.ok).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
