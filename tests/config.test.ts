import { describe, it, expect } from "vitest";
import { parseMoeiconsConfig } from "../src/contracts/config";
import type { MoeiconsConfig } from "../src/contracts/config";

const validReact: MoeiconsConfig = {
  schemaVersion: 1,
  framework: "react",
  outputDir: "src/moeicons",
  defaultTheme: "outline",
  themes: {
    outline: { styles: ["outline"], defaultSize: 20, strokeWidth: 2, className: "text-zinc-700" },
    solid: { styles: ["fill"], defaultSize: 20 },
  },
  icons: ["search", "user", "settings"],
  missingIconPolicy: "fallback",
};

describe("parseMoeiconsConfig", () => {
  it("accepts a valid React config", () => {
    const result = parseMoeiconsConfig(validReact);
    expect(result.ok).toBe(true);
  });

  it("accepts a valid Vue config (D-09: Vue defaults valid)", () => {
    const vueConfig: MoeiconsConfig = {
      ...validReact,
      framework: "vue",
      themes: { outline: { styles: ["outline"], className: "text-zinc-700" } },
    };
    const result = parseMoeiconsConfig(vueConfig);
    expect(result.ok).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(parseMoeiconsConfig(null).ok).toBe(false);
  });

  it("rejects unsupported version", () => {
    const result = parseMoeiconsConfig({ ...validReact, schemaVersion: 2 });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid framework", () => {
    const result = parseMoeiconsConfig({ ...validReact, framework: "svelte" });
    expect(result.ok).toBe(false);
  });

  it("rejects unknown defaultTheme", () => {
    const result = parseMoeiconsConfig({ ...validReact, defaultTheme: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "DEFAULT_THEME_UNKNOWN")).toBe(true);
  });

  it("rejects invalid icons", () => {
    const result = parseMoeiconsConfig({ ...validReact, icons: ["Search_Icon"] });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid missingIconPolicy", () => {
    const result = parseMoeiconsConfig({ ...validReact, missingIconPolicy: "ignore" });
    expect(result.ok).toBe(false);
  });

  it("ignores unknown fields (documented policy)", () => {
    const result = parseMoeiconsConfig({ ...validReact, extra: 123, themes: { ...validReact.themes } });
    expect(result.ok).toBe(true);
  });
});
