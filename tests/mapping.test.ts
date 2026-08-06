import { describe, it, expect } from "vitest";
import {
  createMappingState,
  assignSvg,
  unassignSvg,
  getMappingProgress,
  listMappingIssues,
  parseMappingForm,
} from "../src/mapping/mapping";
import type { IconCatalog } from "../src/contracts/types";
import type { SvgSource } from "../src/svg/parse";

const catalog: IconCatalog = {
  schemaVersion: 1,
  icons: [
    {
      id: "arrow-chevron-right",
      subgroupId: "arrow",
      label: "Arrow chevron right",
      aliases: [],
      addedAt: "2026-08-06T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
    },
    {
      id: "arrow-chevron-left",
      subgroupId: "arrow",
      label: "Arrow chevron left",
      aliases: [],
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
    },
  ],
};

function src(name: string): SvgSource {
  return { name, text: "<svg/>", byteLength: name.length };
}

describe("createMappingState", () => {
  it("creates one slot per selected id (empty selection allowed)", () => {
    const r = createMappingState(catalog, []);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it("allows partial selection", () => {
    const r = createMappingState(catalog, ["arrow-chevron-right"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toHaveLength(1);
  });

  it("allows full selection", () => {
    const r = createMappingState(catalog, catalog.icons.map((i) => i.id));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toHaveLength(3);
  });

  it("rejects unknown ids", () => {
    const r = createMappingState(catalog, ["arrow-chevron-right", "nope"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "UNKNOWN_ICON_ID")).toBe(true);
  });
});

describe("assignSvg", () => {
  it("assigns a source", () => {
    const state = createMappingState(catalog, ["arrow-chevron-right"]);
    if (!state.ok) throw new Error("setup");
    const r = assignSvg(state.value, "arrow-chevron-right", src("mine.svg"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value[0]?.assignedSource).toBe("mine.svg");
  });

  it("replaces an existing assignment", () => {
    const state = createMappingState(catalog, ["arrow-chevron-right"]);
    if (!state.ok) throw new Error("setup");
    const a = assignSvg(state.value, "arrow-chevron-right", src("a.svg"));
    if (!a.ok) throw new Error("first assign");
    const b = assignSvg(a.value, "arrow-chevron-right", src("b.svg"));
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.value[0]?.assignedSource).toBe("b.svg");
  });

  it("retains prior assignment when replacement fails validation", () => {
    const state = createMappingState(catalog, ["arrow-chevron-right"]);
    if (!state.ok) throw new Error("setup");
    const a = assignSvg(state.value, "arrow-chevron-right", src("a.svg"));
    if (!a.ok) throw new Error("first assign");
    const b = assignSvg(a.value, "arrow-chevron-right", src("bad.svg"), {
      validate: () => false,
    });
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.errors.some((e) => e.code === "VALIDATION_FAILED")).toBe(true);
    }
    expect(a.value[0]?.assignedSource).toBe("a.svg");
  });

  it("rejects unknown or unselected id", () => {
    const state = createMappingState(catalog, ["arrow-chevron-right"]);
    if (!state.ok) throw new Error("setup");
    const r = assignSvg(state.value, "user-circle", src("x.svg"));
    expect(r.ok).toBe(false);
  });
});

describe("unassignSvg", () => {
  it("removes an assignment", () => {
    const state = createMappingState(catalog, ["arrow-chevron-right"]);
    if (!state.ok) throw new Error("setup");
    const a = assignSvg(state.value, "arrow-chevron-right", src("x.svg"));
    if (!a.ok) throw new Error("assign");
    const u = unassignSvg(a.value, "arrow-chevron-right");
    expect(u.ok).toBe(true);
    if (u.ok) expect(u.value[0]?.assignedSource).toBeUndefined();
  });
});

describe("getMappingProgress / listMappingIssues", () => {
  it("reports counts from state only", () => {
    const state = createMappingState(catalog, ["arrow-chevron-right", "user-circle"]);
    if (!state.ok) throw new Error("setup");
    const a = assignSvg(state.value, "user-circle", src("u.svg"));
    if (!a.ok) throw new Error("assign");
    const progress = getMappingProgress(a.value);
    expect(progress.selected).toBe(2);
    expect(progress.filled).toBe(1);
    expect(progress.missing).toBe(1);
  });

  it("reports zero division safely on empty selection", () => {
    const state = createMappingState(catalog, []);
    if (!state.ok) throw new Error("setup");
    const p = getMappingProgress(state.value);
    expect(p.selected).toBe(0);
    expect(p.missing).toBe(0);
  });

  it("lists missing icons as warnings", () => {
    const state = createMappingState(catalog, ["arrow-chevron-right"]);
    if (!state.ok) throw new Error("setup");
    const issues = listMappingIssues(state.value);
    expect(issues.some((i) => i.code === "MISSING_ICON")).toBe(true);
  });
});

describe("parseMappingForm", () => {
  it("accepts a valid partial mapping", () => {
    const r = parseMappingForm({
      mappings: [{ iconId: "arrow-chevron-right", file: "f1" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([{ iconId: "arrow-chevron-right", file: "f1" }]);
  });

  it("rejects duplicate target", () => {
    const r = parseMappingForm({
      mappings: [
        { iconId: "arrow-chevron-right", file: "f1" },
        { iconId: "arrow-chevron-right", file: "f2" },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "DUPLICATE_TARGET")).toBe(true);
  });

  it("rejects unknown id format", () => {
    const r = parseMappingForm({ mappings: [{ iconId: "Nope", file: "f1" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "INVALID_ICON_ID")).toBe(true);
  });

  it("rejects missing file reference", () => {
    const r = parseMappingForm({ mappings: [{ iconId: "arrow-chevron-right" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "MISSING_FILE")).toBe(true);
  });

  it("rejects traversal paths in browser mode", () => {
    const r = parseMappingForm(
      { mappings: [{ iconId: "arrow-chevron-right", file: "../secret.svg" }] },
      { browserMode: true },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "FORBIDDEN_PATH")).toBe(true);
  });

  it("rejects non-object input", () => {
    const r = parseMappingForm("nope");
    expect(r.ok).toBe(false);
  });
});
