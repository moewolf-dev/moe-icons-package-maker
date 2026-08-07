import { describe, it, expect } from "vitest";
import { normalizeImportFileName, matchCandidatesExactly } from "../src/import/match";
import type { ImportCandidate } from "../src/import/types";
import { parseIconCatalog, indexIconCatalog } from "../src/catalog/catalog";
import type { CatalogIndex } from "../src/contracts/types";

const CATALOG = {
  schemaVersion: 1,
  icons: [
    { id: "arrow-chevron-right", subgroupId: "arrow", label: "Arrow", aliases: [], addedAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" },
    { id: "user-circle", subgroupId: "user", label: "User", aliases: [], addedAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" },
    { id: "building-home", subgroupId: "building", label: "Building", aliases: [], addedAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" },
  ],
};

function index(): CatalogIndex {
  const parsed = parseIconCatalog(CATALOG);
  if (!parsed.ok) throw new Error("bad fixture");
  return indexIconCatalog(parsed.value);
}

describe("normalizeImportFileName", () => {
  it("removes only the last .svg/.xml extension, preserving inner hyphens", () => {
    expect(normalizeImportFileName("arrow-chevron-right.svg")).toBe("arrow-chevron-right");
    expect(normalizeImportFileName("user-circle.xml")).toBe("user-circle");
    expect(normalizeImportFileName("arrow.svg.svg")).toBe("arrow.svg");
  });

  it("is case-insensitive on the extension but keeps the base case", () => {
    expect(normalizeImportFileName("Arrow-Chevron-Right.SVG")).toBe("Arrow-Chevron-Right");
  });

  it("does not camelCase or alter the stem", () => {
    expect(normalizeImportFileName("building-home.svg")).toBe("building-home");
  });

  it("returns the name unchanged when there is no svg/xml extension", () => {
    expect(normalizeImportFileName("readme.txt")).toBe("readme.txt");
  });
});

describe("matchCandidatesExactly", () => {
  function cand(id: string, name: string): ImportCandidate {
    return { opaqueId: id, fileName: name, size: 1, mimeType: "image/svg+xml" };
  }

  it("matches files whose name equals a canonical icon id (stable order)", () => {
    const candidates = [cand("b", "user-circle.svg"), cand("a", "arrow-chevron-right.svg"), cand("c", "building-home.svg")];
    const matches = matchCandidatesExactly(candidates, index());
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.iconId)).toEqual(["arrow-chevron-right", "user-circle", "building-home"]);
    expect(matches.every((m) => m.reason === "exact-file-name")).toBe(true);
  });

  it("leaves unmatched files out of the match list", () => {
    const candidates = [cand("a", "arrow-chevron-right.svg"), cand("b", "unknown-icon.svg")];
    const matches = matchCandidatesExactly(candidates, index());
    expect(matches).toHaveLength(1);
    expect(matches[0]?.candidateId).toBe("a");
  });

  it("case differences do not match (exact only)", () => {
    const candidates = [cand("a", "Arrow-Chevron-Right.svg")];
    const matches = matchCandidatesExactly(candidates, index());
    expect(matches).toHaveLength(0);
  });

  it("matches are deterministic regardless of input order", () => {
    const a = [cand("b", "user-circle.svg"), cand("a", "arrow-chevron-right.svg")];
    const b = [cand("a", "arrow-chevron-right.svg"), cand("b", "user-circle.svg")];
    const ma = matchCandidatesExactly(a, index()).map((m) => m.candidateId).join(",");
    const mb = matchCandidatesExactly(b, index()).map((m) => m.candidateId).join(",");
    expect(ma).toBe(mb);
  });
});
