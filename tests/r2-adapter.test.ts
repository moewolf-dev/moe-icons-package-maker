import { describe, it, expect, vi, afterEach } from "vitest";
import { uploadGroup, type R2AdapterConfig, type R2UploadEntry } from "../src/adapters/r2/r2";

const config: R2AdapterConfig = {
  endpoint: "https://abc.r2.cloudflarestorage.com",
  bucket: "moe-icons-user-groups",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "secret",
  publicBaseUrl: "https://assets.moeicons.com",
};

function makeEntries(): R2UploadEntry[] {
  return [
    {
      key: "groups/my-group/aaaaaaaa/manifest.json",
      body: new TextEncoder().encode('{"ok":true}'),
      contentType: "application/json",
    },
    {
      key: "groups/my-group/aaaaaaaa/arrow/a.svg",
      body: new TextEncoder().encode("<svg/>"),
      contentType: "image/svg+xml",
    },
  ];
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("uploadGroup", () => {
  it("uploads all entries and returns public URLs on success", async () => {
    const seen: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      seen.push(u);
      if (u.includes("groups/my-group/aaaaaaaa/manifest.json")) return new Response("", { status: 200 });
      if (u.includes("groups/my-group/aaaaaaaa/arrow/a.svg")) return new Response("", { status: 200 });
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await uploadGroup(config, makeEntries());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.uploaded).toHaveLength(2);
      expect(result.publicUrl).toContain("assets.moeicons.com");
    }
    expect(seen.length).toBe(2);
  });

  it("rolls back already-uploaded keys on failure", async () => {
    const deletes: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = url.toString();
      const method = init?.method ?? "PUT";
      if (method === "DELETE") {
        deletes.push(u);
        return new Response("", { status: 204 });
      }
      if (u.includes("manifest.json")) return new Response("", { status: 200 });
      if (u.includes("arrow/a.svg")) return new Response("error", { status: 500 });
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await uploadGroup(config, makeEntries());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UPLOAD_FAILED");
    // manifest was uploaded then cleaned up via DELETE
    expect(deletes.some((d) => d.includes("manifest.json"))).toBe(true);
  });

  it("handles network errors with cleanup", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await uploadGroup(config, makeEntries());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UPLOAD_ERROR");
  });
});
