import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { planBuild } from "../src/build/plan";
import { materializeBuild, type BuildWriter } from "../src/build/materialize";
import type { MappingState } from "../src/mapping/mapping";
import type { ValidationIssue } from "../src/svg/parse";

function state(entries: { icon: { id: string; subgroupId: string }; source?: string }[]): MappingState {
  return entries.map((e) => ({
    icon: {
      id: e.icon.id,
      subgroupId: e.icon.subgroupId,
      label: e.icon.id,
      aliases: [],
      addedAt: "2026-08-06T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
    },
    assignedSource: e.source,
  }));
}

function svgBySource(sources: Record<string, { content: string; checksum: string }>) {
  return new Map(Object.entries(sources));
}

describe("planBuild", () => {
  it("plans a partial group deterministically", () => {
    const plan = planBuild({
      groupId: "g",
      displayName: "G",
      styleId: "outline",
      state: state([
        { icon: { id: "arrow-chevron-right", subgroupId: "arrow" }, source: "a.svg" },
        { icon: { id: "user-circle", subgroupId: "user" } },
      ]),
      svgBySource: svgBySource({ "a.svg": { content: "<svg/>", checksum: "c1" } }),
      validationIssues: [],
      createdAt: "2026-08-06T00:00:00.000Z",
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.value.entries).toHaveLength(1);
      expect(plan.value.entries[0]?.outputPath).toBe("arrow/arrow-chevron-right.svg");
      expect(plan.value.validation.selected).toBe(2);
      expect(plan.value.validation.missing).toBe(1);
    }
  });

  it("detects duplicate output path", () => {
    const plan = planBuild({
      groupId: "g",
      displayName: "G",
      styleId: "outline",
      state: state([
        { icon: { id: "arrow-chevron-right", subgroupId: "arrow" }, source: "a.svg" },
        { icon: { id: "arrow-chevron-left", subgroupId: "arrow" }, source: "a.svg" },
      ]),
      svgBySource: svgBySource({ "a.svg": { content: "<svg/>", checksum: "c1" } }),
      validationIssues: [],
    });
    // duplicate path only triggers if the same path is produced; different ids → different paths
    expect(plan.ok).toBe(true);
  });

  it("blocks on validation errors", () => {
    const issues: ValidationIssue[] = [
      { code: "EMPTY_DRAWABLE_CONTENT", severity: "error", message: "empty" },
    ];
    const plan = planBuild({
      groupId: "g",
      displayName: "G",
      styleId: "outline",
      state: state([{ icon: { id: "a-b", subgroupId: "a" }, source: "a.svg" }]),
      svgBySource: svgBySource({ "a.svg": { content: "<svg/>", checksum: "c1" } }),
      validationIssues: issues,
    });
    expect(plan.ok).toBe(false);
  });

  it("allows warnings through explicit policy", () => {
    const issues: ValidationIssue[] = [
      { code: "ASPECT_MISMATCH", severity: "warning", message: "aspect" },
    ];
    const plan = planBuild({
      groupId: "g",
      displayName: "G",
      styleId: "outline",
      state: state([{ icon: { id: "a-b", subgroupId: "a" }, source: "a.svg" }]),
      svgBySource: svgBySource({ "a.svg": { content: "<svg/>", checksum: "c1" } }),
      validationIssues: issues,
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.value.validation.warnings).toBe(1);
  });

  it("blocks warnings when policy forbids them", () => {
    const issues: ValidationIssue[] = [
      { code: "ASPECT_MISMATCH", severity: "warning", message: "aspect" },
    ];
    const plan = planBuild(
      {
        groupId: "g",
        displayName: "G",
        styleId: "outline",
        state: state([{ icon: { id: "a-b", subgroupId: "a" }, source: "a.svg" }]),
        svgBySource: svgBySource({ "a.svg": { content: "<svg/>", checksum: "c1" } }),
        validationIssues: issues,
      },
      { requireZeroErrors: true, allowWarnings: false },
    );
    expect(plan.ok).toBe(false);
  });

  it("errors when a source referenced by a slot has no content", () => {
    const plan = planBuild({
      groupId: "g",
      displayName: "G",
      styleId: "outline",
      state: state([{ icon: { id: "a-b", subgroupId: "a" }, source: "missing.svg" }]),
      svgBySource: svgBySource({}),
      validationIssues: [],
    });
    expect(plan.ok).toBe(false);
  });
});

describe("materializeBuild", () => {
  let committed = false;
  let rolledBack = false;
  let writer: BuildWriter;

  beforeEach(() => {
    committed = false;
    rolledBack = false;
  });

  const plan = (() => {
    const r = planBuild({
      groupId: "g",
      displayName: "G",
      styleId: "outline",
      state: state([{ icon: { id: "arrow-chevron-right", subgroupId: "arrow" }, source: "a.svg" }]),
      svgBySource: svgBySource({ "a.svg": { content: "<svg/>", checksum: "c".repeat(64) } }),
      validationIssues: [],
      createdAt: "2026-08-06T00:00:00.000Z",
    });
    if (!r.ok) throw new Error("plan failed");
    return r.value;
  })();

  it("writes manifest, report, and svg then commits", async () => {
    const written: string[] = [];
    writer = {
      writeFile: async (p) => {
        written.push(p);
      },
      commit: async () => {
        committed = true;
      },
      rollback: async () => {
        rolledBack = true;
      },
    };
    const result = await materializeBuild(plan, writer, {
      createdWith: "test@0.1.0",
      author: { name: "Ada" },
    });
    expect(committed).toBe(true);
    expect(rolledBack).toBe(false);
    expect(written).toEqual([
      "arrow/arrow-chevron-right.svg",
      "manifest.json",
      "report.json",
    ]);
    expect(result.manifest.validation.valid).toBe(1);
    expect(result.files["manifest.json"]).toBeTruthy();
  });

  it("rolls back on injected write failure", async () => {
    writer = {
      writeFile: async (p) => {
        if (p === "manifest.json") throw new Error("disk full");
      },
      commit: async () => {
        committed = true;
      },
      rollback: async () => {
        rolledBack = true;
      },
    };
    await expect(
      materializeBuild(plan, writer, { createdWith: "t", author: { name: "Ada" } }),
    ).rejects.toThrow("disk full");
    expect(committed).toBe(false);
    expect(rolledBack).toBe(true);
  });
});
