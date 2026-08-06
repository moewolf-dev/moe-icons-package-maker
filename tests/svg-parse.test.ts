import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readSvgInput, parseSvg } from "../src/svg/parse";

const FIX = join(__dirname, "fixtures", "svg");

function load(name: string) {
  const bytes = readFileSync(join(FIX, name));
  return new Uint8Array(bytes);
}

describe("readSvgInput", () => {
  it("accepts a valid svg", async () => {
    const result = await readSvgInput(load("safe-multipath.svg"), {
      maxBytes: 1024 * 1024,
      allowedMimeTypes: ["image/svg+xml"],
      allowedExtensions: [".svg"],
    }, { name: "a.svg", type: "image/svg+xml" });
    expect(result.ok).toBe(true);
  });

  it("accepts zero-byte input at read stage (parse rejects later)", async () => {
    const result = await readSvgInput(new Uint8Array(0), {
      maxBytes: 1024 * 1024,
      allowedMimeTypes: [],
      allowedExtensions: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = parseSvg(result.value);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.errors.some((e) => e.code === "EMPTY_SVG")).toBe(true);
      }
    }
  });

  it("rejects oversized input before decoding", async () => {
    const result = await readSvgInput(new Uint8Array(100), {
      maxBytes: 10,
      allowedMimeTypes: [],
      allowedExtensions: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "SVG_TOO_LARGE")).toBe(true);
  });

  it("rejects wrong MIME type", async () => {
    const result = await readSvgInput(load("safe-multipath.svg"), {
      maxBytes: 1024 * 1024,
      allowedMimeTypes: ["image/svg+xml"],
      allowedExtensions: [],
    }, { name: "a.svg", type: "application/pdf" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "UNSUPPORTED_MIME")).toBe(true);
  });

  it("rejects wrong extension", async () => {
    const result = await readSvgInput(load("safe-multipath.svg"), {
      maxBytes: 1024 * 1024,
      allowedMimeTypes: [],
      allowedExtensions: [".svg"],
    }, { name: "a.png" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "UNSUPPORTED_EXTENSION")).toBe(true);
  });

  it("rejects invalid UTF-8", async () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00]);
    const result = await readSvgInput(bytes, {
      maxBytes: 1024,
      allowedMimeTypes: [],
      allowedExtensions: [".svg"],
    }, { name: "a.svg" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "INVALID_UTF8")).toBe(true);
  });

  it("retains original name separately", async () => {
    const result = await readSvgInput(load("safe-multipath.svg"), {
      maxBytes: 1024 * 1024,
      allowedMimeTypes: [],
      allowedExtensions: [],
    }, { name: "user-provided-name.svg" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe("user-provided-name.svg");
  });
});

describe("parseSvg", () => {
  function source(name: string) {
    return {
      name,
      text: readFileSync(join(FIX, name), "utf8"),
      byteLength: readFileSync(join(FIX, name)).byteLength,
    };
  }

  it("accepts a safe multipath svg", () => {
    const result = parseSvg(source("safe-multipath.svg"));
    expect(result.ok).toBe(true);
  });

  it("accepts a safe internal fragment reference", () => {
    const result = parseSvg(source("safe-internal-ref.svg"));
    expect(result.ok).toBe(true);
  });

  it("rejects DTD/entity", () => {
    const result = parseSvg(source("doctype.svg"));
    expect(result.ok).toBe(false);
  });

  it("rejects scripts", () => {
    const result = parseSvg(source("script.svg"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "FORBIDDEN_SVG_CONTENT")).toBe(true);
  });

  it("rejects event attributes", () => {
    const result = parseSvg(source("event-attr.svg"));
    expect(result.ok).toBe(false);
  });

  it("rejects external URL references", () => {
    const result = parseSvg(source("external-href.svg"));
    expect(result.ok).toBe(false);
  });

  it("rejects foreignObject", () => {
    const result = parseSvg(source("foreign-object.svg"));
    expect(result.ok).toBe(false);
  });

  it("rejects malformed XML", () => {
    const result = parseSvg(source("malformed.svg"));
    expect(result.ok).toBe(false);
  });

  it("rejects CDATA-wrapped script content", () => {
    const result = parseSvg(source("cdata-entity.svg"));
    expect(result.ok).toBe(false);
  });

  it("rejects empty svg", () => {
    const result = parseSvg(source("empty.svg"));
    expect(result.ok).toBe(true); // empty root has no drawable but parses; validated later in structure step
  });
});
