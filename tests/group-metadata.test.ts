import { describe, it, expect } from "vitest";
import { validateGroupMetadata } from "../src/contracts/group-metadata";

const VALID = {
  groupId: "my-group",
  displayName: "My Group",
  styleId: "outline",
  author: "Someone",
  email: "someone@example.com",
  source: "https://example.com/icons",
  license: "MIT",
};

describe("validateGroupMetadata", () => {
  it("accepts a valid group", () => {
    const result = validateGroupMetadata(VALID);
    expect(result.ok).toBe(true);
  });

  it("allows empty email and source", () => {
    const result = validateGroupMetadata({ ...VALID, email: "", source: "" });
    expect(result.ok).toBe(true);
  });

  it("rejects non-object input", () => {
    expect(validateGroupMetadata(null).ok).toBe(false);
    expect(validateGroupMetadata("x").ok).toBe(false);
  });

  it("rejects a missing or invalid groupId", () => {
    expect(validateGroupMetadata({ ...VALID, groupId: "" }).ok).toBe(false);
    expect(validateGroupMetadata({ ...VALID, groupId: "My Group!" }).ok).toBe(false);
    expect(validateGroupMetadata({ ...VALID, groupId: "UPPER" }).ok).toBe(false);
  });

  it("preserves canonical hyphens (no silent rewrite)", () => {
    const result = validateGroupMetadata({ ...VALID, groupId: "arrow-chevron-right" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.groupId).toBe("arrow-chevron-right");
  });

  it("trims display text but reports required fields", () => {
    const result = validateGroupMetadata({ ...VALID, displayName: "   " });
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(validateGroupMetadata({ ...VALID, email: "not-an-email" }).ok).toBe(false);
  });

  it("rejects a non-https source", () => {
    expect(validateGroupMetadata({ ...VALID, source: "http://example.com" }).ok).toBe(false);
    expect(validateGroupMetadata({ ...VALID, source: "ftp://x" }).ok).toBe(false);
    expect(validateGroupMetadata({ ...VALID, source: "not-a-url" }).ok).toBe(false);
  });

  it("accepts an https source", () => {
    const result = validateGroupMetadata({ ...VALID, source: "https://example.com/icons" });
    expect(result.ok).toBe(true);
  });

  it("rejects a license outside the allowlist", () => {
    expect(validateGroupMetadata({ ...VALID, license: "GPL-3.0" }).ok).toBe(false);
  });

  it("requires a note when license is Other", () => {
    expect(validateGroupMetadata({ ...VALID, license: "Other" }).ok).toBe(false);
    const ok = validateGroupMetadata({ ...VALID, license: "Other", licenseOther: "custom terms" });
    expect(ok.ok).toBe(true);
  });

  it("enforces length limits", () => {
    expect(validateGroupMetadata({ ...VALID, groupId: "a".repeat(65) }).ok).toBe(false);
    expect(validateGroupMetadata({ ...VALID, displayName: "a".repeat(121) }).ok).toBe(false);
  });

  it("accepts Unicode display names", () => {
    const result = validateGroupMetadata({ ...VALID, displayName: "自定义图标组" });
    expect(result.ok).toBe(true);
  });

  it("returns field paths on errors", () => {
    const result = validateGroupMetadata({ ...VALID, groupId: "", email: "bad", license: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain("groupId");
      expect(fields).toContain("email");
      expect(fields).toContain("license");
    }
  });
});
