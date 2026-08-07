import { describe, it, expect } from "vitest";
import { runBuildPreflight } from "../src/build/preflight";
import type { MappingState } from "../src/mapping/mapping";
import type { ValidationIssue } from "../src/svg/parse";

function slot(id: string, subgroupId: string, assigned: string | undefined) {
  return {
    icon: {
      id,
      subgroupId,
      label: id,
      aliases: [],
      addedAt: "2026-08-06T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
    },
    assignedSource: assigned,
  };
}

function state(entries: { id: string; subgroupId: string; assigned: string | undefined }[]): MappingState {
  return entries.map((e) => slot(e.id, e.subgroupId, e.assigned));
}

const METADATA = {
  groupId: "my-group",
  displayName: "My Group",
  styleId: "outline",
  author: "t",
  email: "",
  source: "",
  license: "MIT",
};

function svgBySource(): ReadonlyMap<string, { content: string; checksum: string }> {
  return new Map([
    ["a.svg", { content: "<svg></svg>", checksum: "a".repeat(64) }],
  ]);
}

describe("runBuildPreflight", () => {
  it("reports counts and allowed build for a clean group", () => {
    const result = runBuildPreflight({
      state: state([{ id: "arrow-chevron-right", subgroupId: "arrow", assigned: "a.svg" }]),
      metadata: METADATA,
      validationByIcon: new Map<string, readonly ValidationIssue[]>(),
      svgBySource: svgBySource(),
      fallbackPolicy: "fallback",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.counts.selected).toBe(1);
    expect(result.value.counts.filled).toBe(1);
    expect(result.value.counts.errors).toBe(0);
    expect(result.value.buildAllowed).toBe(true);
    expect(result.value.outputPaths).toEqual(["arrow/arrow-chevron-right.svg"]);
  });

  it("blocks build on validation errors", () => {
    const result = runBuildPreflight({
      state: state([{ id: "a", subgroupId: "arrow", assigned: "a.svg" }]),
      metadata: METADATA,
      validationByIcon: new Map([
        ["a", [{ code: "EMPTY", severity: "error", message: "empty", iconId: "a" }]],
      ]),
      svgBySource: svgBySource(),
      fallbackPolicy: "error",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.severity === "error")).toBe(true);
      expect(result.errors.some((e) => e.outputPath === "arrow/a.svg")).toBe(true);
    }
  });

  it("missing icons are warnings and block under error policy", () => {
    const result = runBuildPreflight({
      state: state([
        { id: "a", subgroupId: "arrow", assigned: "a.svg" },
        { id: "b", subgroupId: "arrow", assigned: undefined },
      ]),
      metadata: METADATA,
      validationByIcon: new Map(),
      svgBySource: svgBySource(),
      fallbackPolicy: "error",
    });
    expect(result.ok).toBe(false);
  });

  it("warnings allow build under fallback policy", () => {
    const result = runBuildPreflight({
      state: state([
        { id: "a", subgroupId: "arrow", assigned: "a.svg" },
        { id: "b", subgroupId: "arrow", assigned: undefined },
      ]),
      metadata: METADATA,
      validationByIcon: new Map(),
      svgBySource: svgBySource(),
      fallbackPolicy: "fallback",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.buildAllowed).toBe(true);
  });

  it("estimates UTF-8 byte size deterministically", () => {
    const result = runBuildPreflight({
      state: state([{ id: "a", subgroupId: "arrow", assigned: "a.svg" }]),
      metadata: METADATA,
      validationByIcon: new Map(),
      svgBySource: new Map([["a.svg", { content: "<svg></svg>", checksum: "a".repeat(64) }]]),
      fallbackPolicy: "fallback",
    });
    if (result.ok) {
      expect(result.value.utf8Bytes).toBeGreaterThan(0);
      // deterministic: same input -> same bytes
      const again = runBuildPreflight({
        state: state([{ id: "a", subgroupId: "arrow", assigned: "a.svg" }]),
        metadata: METADATA,
        validationByIcon: new Map(),
        svgBySource: new Map([["a.svg", { content: "<svg></svg>", checksum: "a".repeat(64) }]]),
        fallbackPolicy: "fallback",
      });
      if (again.ok) expect(again.value.utf8Bytes).toBe(result.value.utf8Bytes);
    }
  });

  it("includes a manifest preview with stable serialization", () => {
    const result = runBuildPreflight({
      state: state([{ id: "a", subgroupId: "arrow", assigned: "a.svg" }]),
      metadata: METADATA,
      validationByIcon: new Map(),
      svgBySource: svgBySource(),
      fallbackPolicy: "fallback",
    });
    if (result.ok) {
      expect(result.value.manifestPreview).toContain("my-group");
      expect(result.value.manifestPreview.endsWith("\n")).toBe(true);
    }
  });

  it("rejects unsafe output paths", () => {
    const result = runBuildPreflight({
      state: state([{ id: "../escape", subgroupId: "arrow", assigned: "a.svg" }]),
      metadata: METADATA,
      validationByIcon: new Map(),
      svgBySource: svgBySource(),
      fallbackPolicy: "fallback",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "UNSAFE_OUTPUT_PATH")).toBe(true);
    }
  });
});
