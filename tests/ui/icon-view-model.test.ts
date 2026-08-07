import { describe, it, expect } from "vitest";
import { deriveIconSlotViewModels, filterByStatuses, type ValidationByIcon } from "../../src/ui/icon-view-model";
import type { IconDefinition } from "../../src/contracts/types";
import type { MappingState } from "../../src/mapping/mapping";

function icon(id: string): IconDefinition {
  return {
    id,
    subgroupId: "symbol",
    label: id,
    aliases: [],
    addedAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
  };
}

function issue(code: string, severity: "error" | "warning", iconId: string) {
  return { code, severity, message: code, iconId };
}

const catalog = { icons: [icon("a"), icon("b"), icon("c")] };

function mapping(ids: string[]): MappingState {
  return ids.map((id) => ({ icon: icon(id), assignedSource: id === "a" ? "a.svg" : undefined }));
}

describe("deriveIconSlotViewModels", () => {
  it("marks assigned icons valid", () => {
    const models = deriveIconSlotViewModels(catalog, mapping(["a"]), new Map());
    const a = models.find((m) => m.icon.id === "a");
    expect(a?.status).toBe("valid");
  });

  it("marks selected-but-unassigned icons missing and unselected icons unselected", () => {
    const models = deriveIconSlotViewModels(catalog, mapping(["a", "b"]), new Map());
    expect(models.find((m) => m.icon.id === "a")?.status).toBe("valid");
    expect(models.find((m) => m.icon.id === "b")?.status).toBe("missing");
    expect(models.find((m) => m.icon.id === "c")?.status).toBe("unselected");
  });

  it("a later error for one icon does not overwrite another icon's valid state", () => {
    const validationByIcon: ValidationByIcon = new Map([
      ["a", [issue("EMPTY", "error", "a")]],
    ]);
    const models = deriveIconSlotViewModels(catalog, mapping(["a", "b"]), validationByIcon);
    expect(models.find((m) => m.icon.id === "a")?.status).toBe("error");
    expect(models.find((m) => m.icon.id === "b")?.status).toBe("missing");
  });

  it("two icons with distinct issues keep both independently", () => {
    const validationByIcon: ValidationByIcon = new Map([
      ["a", [issue("X", "error", "a")]],
      ["b", [issue("Y", "warning", "b")]],
    ]);
    const models = deriveIconSlotViewModels(catalog, mapping(["a", "b"]), validationByIcon);
    expect(models.find((m) => m.icon.id === "a")?.status).toBe("error");
    expect(models.find((m) => m.icon.id === "b")?.status).toBe("warning");
    expect(models.find((m) => m.icon.id === "a")?.issues).toHaveLength(1);
    expect(models.find((m) => m.icon.id === "b")?.issues).toHaveLength(1);
  });

  it("warning beats valid but error beats warning", () => {
    const validationByIcon: ValidationByIcon = new Map([
      ["a", [issue("W", "warning", "a")]],
      ["b", [issue("E", "error", "b")]],
    ]);
    const models = deriveIconSlotViewModels(catalog, mapping(["a", "b"]), validationByIcon);
    expect(models.find((m) => m.icon.id === "a")?.status).toBe("warning");
    expect(models.find((m) => m.icon.id === "b")?.status).toBe("error");
  });

  it("is a pure function: does not mutate inputs", () => {
    const state = mapping(["a"]);
    const issues: ValidationByIcon = new Map();
    const inputSnapshot = JSON.stringify({ state, issues });
    deriveIconSlotViewModels(catalog, state, issues);
    expect(JSON.stringify({ state, issues })).toBe(inputSnapshot);
  });
});

describe("filterByStatuses", () => {
  const models = [
    { icon: icon("a"), status: "valid" as const, issues: [] as never[] },
    { icon: icon("b"), status: "missing" as const, issues: [] as never[] },
    { icon: icon("c"), status: "error" as const, issues: [] as never[] },
  ];

  it("returns all when no statuses selected", () => {
    expect(filterByStatuses(models, [])).toHaveLength(3);
  });

  it("filters by a single status", () => {
    const out = filterByStatuses(models, ["error"]);
    expect(out.map((m) => m.icon.id)).toEqual(["c"]);
  });

  it("filters by multiple statuses", () => {
    const out = filterByStatuses(models, ["valid", "missing"]);
    expect(out.map((m) => m.icon.id)).toEqual(["a", "b"]);
  });
});
