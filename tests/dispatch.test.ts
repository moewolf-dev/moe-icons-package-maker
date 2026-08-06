import { describe, it, expect } from "vitest";
import {
  authorizeChannel,
  officialChannelAllowed,
  validateUserChannel,
  buildDispatchPayload,
  type DispatchChannel,
} from "../src/adapters/dispatch/dispatch";
import type { IconGroupManifest } from "../src/contracts/manifest";

const manifest: IconGroupManifest = {
  schemaVersion: 1,
  groupId: "my-group",
  displayName: "My Group",
  styleId: "outline",
  author: { name: "Ada" },
  createdWith: "maker@0.1.0",
  createdAt: "2026-08-06T00:00:00.000Z",
  entries: [],
  validation: { selected: 1, filled: 1, valid: 1, warnings: 0, errors: 0, missing: 0 },
};

const channels: readonly DispatchChannel[] = [
  { kind: "official", workflowRef: "official-release.yml", repository: "org/code-library" },
  { kind: "user", workflowRef: "user-r2.yml", repository: "org/code-library" },
];

describe("authorizeChannel", () => {
  it("allows a known channel", () => {
    expect(
      authorizeChannel({ manifest, artifactChecksum: "a".repeat(64), channel: "user" }, channels),
    ).toBe(true);
  });

  it("rejects an unknown channel", () => {
    expect(
      authorizeChannel({ manifest, artifactChecksum: "a".repeat(64), channel: "official" }, [
        channels[1] as DispatchChannel,
      ]),
    ).toBe(false);
  });
});

describe("officialChannelAllowed", () => {
  it("returns true only for official channel", () => {
    expect(
      officialChannelAllowed({ manifest, artifactChecksum: "a".repeat(64), channel: "official" }),
    ).toBe(true);
    expect(
      officialChannelAllowed({ manifest, artifactChecksum: "a".repeat(64), channel: "user" }),
    ).toBe(false);
  });
});

describe("validateUserChannel", () => {
  it("rejects user requests labeled official", () => {
    const result = validateUserChannel({
      manifest,
      artifactChecksum: "a".repeat(64),
      channel: "official",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("USER_CANNOT_SELECT_OFFICIAL");
    }
  });

  it("rejects an invalid checksum", () => {
    const result = validateUserChannel({
      manifest,
      artifactChecksum: "not-hex",
      channel: "user",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_CHECKSUM");
  });

  it("accepts a valid user request", () => {
    const result = validateUserChannel({
      manifest,
      artifactChecksum: "a".repeat(64),
      channel: "user",
    });
    expect(result.ok).toBe(true);
  });
});

describe("buildDispatchPayload", () => {
  it("pins server-held values, not client-supplied", () => {
    const payload = buildDispatchPayload(
      { manifest, artifactChecksum: "a".repeat(64), channel: "user" },
      channels[1] as DispatchChannel,
      { commitSha: "abc123def456" },
    );
    expect(payload.artifact_checksum).toBe("a".repeat(64));
    expect(payload.commit_sha).toBe("abc123def456");
    expect(payload.channel).toBe("user");
    // no arbitrary repo/workflow/ref from client
    expect(Object.keys(payload).some((k) => k.includes("workflow"))).toBe(false);
  });
});
