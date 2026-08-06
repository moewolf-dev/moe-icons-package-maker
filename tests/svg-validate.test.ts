import { describe, it, expect } from "vitest";
import { parseSvg, readSvgInput } from "../src/svg/parse";
import {
  validateSvgStructure,
  validateSvgGeometry,
  DEFAULT_STRUCTURE_POLICY,
} from "../src/svg/validate";

async function parse(text: string) {
  const read = await readSvgInput(text, {
    maxBytes: 1024 * 1024,
    allowedMimeTypes: [],
    allowedExtensions: [],
  });
  if (!read.ok) throw new Error("read failed");
  return parseSvg(read.value);
}

const VALID = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M1 1 L23 23"/></svg>';

describe("validateSvgStructure", () => {
  it("accepts a valid multipath svg", async () => {
    const parsed = await parse(
      '<svg viewBox="0 0 24 24"><g><path d="M1 1"/><circle cx="5" cy="5" r="2"/><rect x="1" y="1" width="3" height="3"/></g></svg>',
    );
    if (!parsed.ok) throw new Error("parse failed");
    expect(validateSvgStructure(parsed.value)).toEqual([]);
  });

  it("warns on empty svg with no viewBox and flags empty drawable", async () => {
    const parsed = await parse('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    if (!parsed.ok) throw new Error("parse failed");
    const issues = validateSvgStructure(parsed.value);
    expect(issues.some((i) => i.code === "EMPTY_DRAWABLE_CONTENT")).toBe(true);
    expect(issues.some((i) => i.code === "MISSING_VIEWBOX")).toBe(true);
  });

  it("errors on zero viewBox", async () => {
    const parsed = await parse(
      '<svg viewBox="0 0 0 0"><path d="M1 1"/></svg>',
    );
    if (!parsed.ok) throw new Error("parse failed");
    const issues = validateSvgStructure(parsed.value);
    expect(issues.some((i) => i.code === "NON_POSITIVE_CANVAS")).toBe(true);
  });

  it("errors on NaN viewBox", async () => {
    const parsed = await parse('<svg viewBox="0 0 abc 24"><path d="M1 1"/></svg>');
    if (!parsed.ok) throw new Error("parse failed");
    const issues = validateSvgStructure(parsed.value);
    expect(issues.some((i) => i.code === "INVALID_VIEWBOX")).toBe(true);
  });

  it("errors on unsupported element", async () => {
    const parsed = await parse('<svg viewBox="0 0 24 24"><audio/></svg>');
    if (!parsed.ok) throw new Error("parse failed");
    const issues = validateSvgStructure(parsed.value);
    expect(issues.some((i) => i.code === "UNSUPPORTED_ELEMENT")).toBe(true);
  });

  it("errors on duplicate id", async () => {
    const parsed = await parse(
      '<svg viewBox="0 0 24 24"><path id="a" d="M1 1"/><circle id="a" cx="5" cy="5" r="2"/></svg>',
    );
    if (!parsed.ok) throw new Error("parse failed");
    const issues = validateSvgStructure(parsed.value);
    expect(issues.some((i) => i.code === "DUPLICATE_ID")).toBe(true);
  });

  it("errors on raster content", async () => {
    const parsed = await parse(
      '<svg viewBox="0 0 24 24"><image href="data:image/png;base64,AAAA"/></svg>',
    );
    if (!parsed.ok) {
      // data: URI rejected at parse time (external reference policy)
      expect(parsed.errors.some((i) => i.code === "FORBIDDEN_EXTERNAL_REFERENCE")).toBe(true);
      return;
    }
    const issues = validateSvgStructure(parsed.value);
    expect(issues.some((i) => i.code === "RASTER_CONTENT")).toBe(true);
  });

  it("warns on unsupported attribute", async () => {
    const parsed = await parse(
      '<svg viewBox="0 0 24 24"><path d="M1 1" data-custom="x"/></svg>',
    );
    if (!parsed.ok) throw new Error("parse failed");
    const issues = validateSvgStructure(parsed.value);
    expect(issues.some((i) => i.code === "UNSUPPORTED_ATTRIBUTE")).toBe(true);
  });
});

describe("validateSvgGeometry", () => {
  it("passes for content inside the viewBox", async () => {
    const parsed = await parse(VALID);
    if (!parsed.ok) throw new Error("parse failed");
    expect(validateSvgGeometry(parsed.value)).toEqual([]);
  });

  it("warns when geometry extends outside the viewBox", async () => {
    const parsed = await parse(
      '<svg viewBox="0 0 24 24"><path d="M1 1 L100 100"/></svg>',
    );
    if (!parsed.ok) throw new Error("parse failed");
    const issues = validateSvgGeometry(parsed.value);
    expect(issues.some((i) => i.code === "OUT_OF_VIEW_X")).toBe(true);
    expect(issues.some((i) => i.code === "OUT_OF_VIEW_Y")).toBe(true);
  });

  it("warns on aspect mismatch between width/height and viewBox", async () => {
    const parsed = await parse(
      '<svg viewBox="0 0 24 24" width="100" height="50"><path d="M1 1"/></svg>',
    );
    if (!parsed.ok) throw new Error("parse failed");
    const issues = validateSvgGeometry(parsed.value);
    expect(issues.some((i) => i.code === "ASPECT_MISMATCH")).toBe(true);
  });

  it("emits no false error when bounds cannot be computed", async () => {
    const parsed = await parse(
      '<svg viewBox="0 0 24 24"><circle cx="5" cy="5" r="2"/></svg>',
    );
    if (!parsed.ok) throw new Error("parse failed");
    expect(validateSvgGeometry(parsed.value)).toEqual([]);
  });

  it("treats geometry violations as errors when configured", async () => {
    const parsed = await parse(
      '<svg viewBox="0 0 24 24"><path d="M1 1 L100 100"/></svg>',
    );
    if (!parsed.ok) throw new Error("parse failed");
    const issues = validateSvgGeometry(parsed.value, { severity: "error" });
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });
});
