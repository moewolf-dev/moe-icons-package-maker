import { describe, it, expect } from "vitest";
import { parseMakerEnv } from "../src/config";

describe("parseMakerEnv", () => {
  it("accepts complete dev config", () => {
    const result = parseMakerEnv({
      MAKER_CATALOG_PATH: "data/icon-catalog.json",
      MAKER_SVG_DIR: "uploads/",
      MAKER_OUTPUT_DIR: "out/",
      MAKER_MAX_SVG_BYTES: "1048576",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.maxSvgBytes).toBe(1048576);
      expect(result.value.catalogPath).toBe("data/icon-catalog.json");
    }
  });

  it("uses defaults when only minimal values present", () => {
    const result = parseMakerEnv({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.catalogPath).toBe("data/icon-catalog.json");
      expect(result.value.maxSvgBytes).toBe(2 * 1024 * 1024);
    }
  });

  it("rejects an invalid byte limit", () => {
    const result = parseMakerEnv({ MAKER_MAX_SVG_BYTES: "-5" });
    expect(result.ok).toBe(false);
  });

  it("ignores unknown variables", () => {
    const result = parseMakerEnv({ UNKNOWN_VAR: "x", MAKER_OUTPUT_DIR: "o/" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.outputDir).toBe("o/");
  });

  it("does not expose secret values in the result", () => {
    const result = parseMakerEnv({ MAKER_GITHUB_TOKEN: "supersecret", MAKER_OUTPUT_DIR: "o/" });
    expect(result.ok).toBe(true);
    const json = JSON.stringify(result);
    expect(json.includes("supersecret")).toBe(false);
  });
});
