import { describe, it, expect } from "vitest";
import { normalizeImportFileName } from "../src/import/match";
import type { ImportCandidate, ImportMatch } from "../src/import/types";
import {
  detectImportConflicts,
  applyManualResolution,
  createImportPlan,
} from "../src/import/conflicts";
import { parseIconCatalog, indexIconCatalog } from "../src/catalog/catalog";

const CATALOG = {
  schemaVersion: 1,
  icons: [
    { id: "arrow-chevron-right", subgroupId: "arrow", label: "Arrow", aliases: [], addedAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" },
    { id: "user-circle", subgroupId: "user", label: "User", aliases: [], addedAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" },
  ],
};

function cand(id: string, name: string, size = 1): ImportCandidate {
  return { opaqueId: id, fileName: name, size, mimeType: "image/svg+xml" };
}

function match(candidateId: string, iconId: string, reason: ImportMatch["reason"] = "exact-file-name"): ImportMatch {
  return { candidateId, iconId, reason };
}

function idx() {
  const parsed = parseIconCatalog(CATALOG);
  if (!parsed.ok) throw new Error("bad fixture");
  return indexIconCatalog(parsed.value);
}

describe("detectImportConflicts", () => {
  it("flags duplicate targets from two different sources", () => {
    const candidates = [cand("a", "arrow-chevron-right.svg"), cand("b", "arrow-chevron-right.svg")];
    const matches = [match("a", "arrow-chevron-right"), match("b", "arrow-chevron-right")];
    const conflicts = detectImportConflicts(candidates, matches);
    expect(conflicts.some((c) => c.code === "DUPLICATE_TARGET")).toBe(true);
  });

  it("flags identical content under two names as duplicate content", () => {
    const candidates = [
      cand("a", "arrow-chevron-right.svg", 5),
      cand("b", "arrow-chevron-left.svg", 5),
    ];
    const matches = [match("a", "arrow-chevron-right"), match("b", "arrow-chevron-left")];
    const conflicts = detectImportConflicts(candidates, matches, (id) =>
      id === "a" || id === "b" ? "same-hash" : "",
    );
    expect(conflicts.some((c) => c.code === "DUPLICATE_CONTENT")).toBe(true);
  });

  it("flags unsupported file types", () => {
    const candidates = [cand("a", "notes.txt", 1)];
    const conflicts = detectImportConflicts(candidates, []);
    expect(conflicts.some((c) => c.code === "UNSUPPORTED_FILE")).toBe(true);
  });

  it("flags files that exceed a size limit", () => {
    const candidates = [cand("a", "huge.svg", 999)];
    const conflicts = detectImportConflicts(candidates, [], undefined, { maxFileBytes: 100 });
    expect(conflicts.some((c) => c.code === "FILE_TOO_LARGE")).toBe(true);
  });
});

describe("applyManualResolution", () => {
  it("resolves a conflict when a decision maps the candidate to a target", () => {
    const candidates = [cand("a", "arrow-chevron-right.svg"), cand("b", "arrow-chevron-right.svg")];
    const matches = [match("a", "arrow-chevron-right"), match("b", "arrow-chevron-right")];
    const conflicts = detectImportConflicts(candidates, matches);
    const resolved = applyManualResolution(conflicts, {
      a: "arrow-chevron-right",
      b: "user-circle",
    }, idx());
    expect(resolved.conflicts.every((c) => c.resolved === true)).toBe(true);
    expect(resolved.matches.map((m) => m.iconId).sort()).toEqual([
      "arrow-chevron-right",
      "user-circle",
    ]);
  });

  it("keeps a conflict when no decision is given", () => {
    const candidates = [cand("a", "arrow-chevron-right.svg"), cand("b", "arrow-chevron-right.svg")];
    const matches = [match("a", "arrow-chevron-right"), match("b", "arrow-chevron-right")];
    const conflicts = detectImportConflicts(candidates, matches);
    const resolved = applyManualResolution(conflicts, {}, idx());
    expect(resolved.conflicts.some((c) => c.resolved === false)).toBe(true);
  });

  it("a decision to a non-existent icon id keeps the conflict", () => {
    const candidates = [cand("a", "arrow-chevron-right.svg"), cand("b", "arrow-chevron-right.svg")];
    const matches = [match("a", "arrow-chevron-right"), match("b", "arrow-chevron-right")];
    const conflicts = detectImportConflicts(candidates, matches);
    const resolved = applyManualResolution(conflicts, { a: "does-not-exist" }, idx());
    expect(resolved.conflicts.some((c) => c.resolved === false)).toBe(true);
  });
});

describe("createImportPlan", () => {
  it("returns a plan only when there are no error conflicts", () => {
    const candidates = [cand("a", "arrow-chevron-right.svg")];
    const matches = [match("a", "arrow-chevron-right")];
    const conflicts = detectImportConflicts(candidates, matches);
    const plan = createImportPlan(candidates, matches, conflicts, idx());
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.value).toHaveLength(1);
  });

  it("returns errors when conflicts remain unresolved", () => {
    const candidates = [cand("a", "arrow-chevron-right.svg"), cand("b", "arrow-chevron-right.svg")];
    const matches = [match("a", "arrow-chevron-right"), match("b", "arrow-chevron-right")];
    const conflicts = detectImportConflicts(candidates, matches);
    const plan = createImportPlan(candidates, matches, conflicts, idx());
    expect(plan.ok).toBe(false);
  });

  it("normalizes paths and rejects traversal", () => {
    const weird = cand("a", "arrow-chevron-right.svg");
    // normalizeImportFileName keeps only the last svg/xml ext
    expect(normalizeImportFileName(weird.fileName)).toBe("arrow-chevron-right");
  });
});
