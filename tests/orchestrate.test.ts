import { describe, it, expect } from "vitest";
import { buildIconGroup } from "../src/build/orchestrate";

const CATALOG = {
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
      id: "user-circle",
      subgroupId: "user",
      label: "User circle",
      aliases: [],
      addedAt: "2026-08-06T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
    },
  ],
};

const GOOD_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1 L23 23"/></svg>';

describe("buildIconGroup", () => {
  it("produces a deterministic ZIP for a valid partial group", async () => {
    const request = {
      catalog: CATALOG,
      selectedIds: ["arrow-chevron-right", "user-circle"],
      sources: { "arrow-chevron-right": GOOD_SVG },
      groupId: "my-custom",
      displayName: "My Custom",
      styleId: "outline",
      author: { name: "Ada" },
    };
    const a = await buildIconGroup(request);
    const b = await buildIconGroup(request);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.zip).toEqual(b.zip);
      expect(a.files["manifest.json"]).toContain("my-custom");
      expect(a.files["arrow/arrow-chevron-right.svg"]).toContain("<svg");
    }
  });

  it("blocks on validation errors (empty svg)", async () => {
    const result = await buildIconGroup({
      catalog: CATALOG,
      selectedIds: ["arrow-chevron-right"],
      sources: { "arrow-chevron-right": "<svg></svg>" },
      groupId: "g",
      displayName: "G",
      styleId: "outline",
      author: { name: "Ada" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("aborts on AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await buildIconGroup(
      {
        catalog: CATALOG,
        selectedIds: ["arrow-chevron-right"],
        sources: { "arrow-chevron-right": GOOD_SVG },
        groupId: "g",
        displayName: "G",
        styleId: "outline",
        author: { name: "Ada" },
      },
      { signal: controller.signal },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.includes("aborted")).toBe(true);
    }
  });

  it("rejects unknown selected id", async () => {
    const result = await buildIconGroup({
      catalog: CATALOG,
      selectedIds: ["nope"],
      sources: {},
      groupId: "g",
      displayName: "G",
      styleId: "outline",
      author: { name: "Ada" },
    });
    expect(result.ok).toBe(false);
  });

  it("reports progress through the lifecycle", async () => {
    const stages: string[] = [];
    const result = await buildIconGroup(
      {
        catalog: CATALOG,
        selectedIds: ["arrow-chevron-right"],
        sources: { "arrow-chevron-right": GOOD_SVG },
        groupId: "g",
        displayName: "G",
        styleId: "outline",
        author: { name: "Ada" },
      },
      { onProgress: (stage) => stages.push(stage) },
    );
    expect(result.ok).toBe(true);
    expect(stages[stages.length - 1]).toBe("done");
  });
});
