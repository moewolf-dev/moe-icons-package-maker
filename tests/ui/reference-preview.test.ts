import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createReferencePreviewUrl,
  probeReferencePreview,
  type ReferencePreviewState,
} from "../../src/ui/reference-preview";

function jsonResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "image/svg+xml" },
  });
}

describe("createReferencePreviewUrl", () => {
  it("generates a same-origin relative URL for a valid icon id", () => {
    expect(createReferencePreviewUrl("arrow-chevron-right")).toBe(
      "/reference-icons/arrow-chevron-right.svg",
    );
  });

  it("rejects traversal, slashes, and encoded path escape", () => {
    expect(() => createReferencePreviewUrl("../secret")).toThrow();
    expect(() => createReferencePreviewUrl("a/b")).toThrow();
    expect(() => createReferencePreviewUrl("a%2Fb")).toThrow();
    expect(() => createReferencePreviewUrl("..%2Fetc%2Fpasswd")).toThrow();
  });

  it("rejects invalid icon ids", () => {
    expect(() => createReferencePreviewUrl("")).toThrow();
    expect(() => createReferencePreviewUrl("A B")).toThrow();
    expect(() => createReferencePreviewUrl("a__b")).toThrow();
    expect(() => createReferencePreviewUrl("a.b")).toThrow();
  });
});

describe("probeReferencePreview", () => {
  const fetchImpl = vi.fn();

  beforeEach(() => {
    fetchImpl.mockReset();
  });

  it("returns available for a 200 SVG", async () => {
    fetchImpl.mockResolvedValue(jsonResponse(200, "<svg></svg>"));
    const state = await probeReferencePreview(
      "/reference-icons/arrow-chevron-right.svg",
      fetchImpl,
      new AbortController().signal,
    );
    expect(state).toBe<ReferencePreviewState>("available");
    expect(fetchImpl).toHaveBeenCalledWith(
      "/reference-icons/arrow-chevron-right.svg",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("returns missing for 404", async () => {
    fetchImpl.mockResolvedValue(jsonResponse(404, ""));
    const state = await probeReferencePreview(
      "/reference-icons/arrow-chevron-right.svg",
      fetchImpl,
      undefined,
    );
    expect(state).toBe<ReferencePreviewState>("missing");
  });

  it("returns error for a 500 or network failure", async () => {
    fetchImpl.mockResolvedValue(jsonResponse(500, ""));
    expect(
      await probeReferencePreview("/reference-icons/x.svg", fetchImpl, undefined),
    ).toBe<ReferencePreviewState>("error");

    fetchImpl.mockRejectedValue(new TypeError("fetch failed"));
    expect(
      await probeReferencePreview("/reference-icons/x.svg", fetchImpl, undefined),
    ).toBe<ReferencePreviewState>("error");
  });

  it("returns cancelled on AbortSignal", async () => {
    const controller = new AbortController();
    fetchImpl.mockRejectedValue(new DOMException("aborted", "AbortError"));
    const state = await probeReferencePreview(
      "/reference-icons/x.svg",
      fetchImpl,
      controller.signal,
    );
    expect(state).toBe<ReferencePreviewState>("cancelled");
  });

  it("only accepts same-origin relative URLs", async () => {
    await expect(
      probeReferencePreview("https://evil.example/x.svg", fetchImpl, undefined),
    ).rejects.toThrow();
    await expect(
      probeReferencePreview("//evil.example/x.svg", fetchImpl, undefined),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
