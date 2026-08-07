import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useImportSession } from "../../src/ui/use-import-session";
import { parseIconCatalog, indexIconCatalog } from "../../src/catalog/catalog";
import type { MakerSession } from "../../src/ui/use-maker-session";

const CATALOG = {
  schemaVersion: 1,
  icons: [
    { id: "arrow-chevron-right", subgroupId: "arrow", label: "Arrow", aliases: [], addedAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" },
    { id: "user-circle", subgroupId: "user", label: "User", aliases: [], addedAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" },
  ],
};

function mockSession() {
  const parsed = parseIconCatalog(CATALOG);
  if (!parsed.ok) throw new Error("bad fixture");
  const index = indexIconCatalog(parsed.value);
  const assignFile = vi.fn(async (id: string, file: File) => ({ ok: true, errors: [] as string[] }));
  const session = {
    catalog: parsed.value,
    index,
    assignFile,
    selectedIds: [] as readonly string[],
    assignments: [] as never[],
    previewUrls: new Map() as ReadonlyMap<string, string>,
    validationByIcon: new Map() as ReadonlyMap<string, readonly never[]>,
  } as unknown as MakerSession;
  return { session, assignFile };
}

function svgFile(name: string, content = "<svg></svg>"): File {
  return new File([content], name, { type: "image/svg+xml" });
}

describe("useImportSession", () => {
  it("exact-match files transition to ready and apply", async () => {
    const { session, assignFile } = mockSession();
    const { result } = renderHook(() => useImportSession(session));

    await act(async () => {
      await result.current.scanFiles([svgFile("arrow-chevron-right.svg"), svgFile("user-circle.svg")]);
    });
    expect(result.current.state).toBe("ready");
    expect(result.current.matches).toHaveLength(2);

    await act(async () => {
      await result.current.apply();
    });
    expect(result.current.state).toBe("success");
    expect(assignFile).toHaveBeenCalledTimes(2);
    expect(assignFile).toHaveBeenCalledWith("arrow-chevron-right", expect.anything());
    expect(assignFile).toHaveBeenCalledWith("user-circle", expect.anything());
  });

  it("an unmatched file goes to conflicts state", async () => {
    const { session } = mockSession();
    const { result } = renderHook(() => useImportSession(session));

    await act(async () => {
      await result.current.scanFiles([svgFile("arrow-chevron-right.svg"), svgFile("unknown.svg")]);
    });
    expect(result.current.state).toBe("conflicts");
    expect(result.current.matches).toHaveLength(1);
  });

  it("manual resolution of an unmatched file applies it", async () => {
    const { session, assignFile } = mockSession();
    const { result } = renderHook(() => useImportSession(session));

    await act(async () => {
      await result.current.scanFiles([svgFile("unknown.svg")]);
    });
    expect(result.current.state).toBe("conflicts");

    await act(async () => {
      result.current.resolveConflict("candidate-0", "user-circle");
    });
    await act(async () => {
      await result.current.apply();
    });
    expect(result.current.state).toBe("success");
    expect(assignFile).toHaveBeenCalledWith("user-circle", expect.anything());
  });

  it("cancel aborts the scan and marks cancelled", async () => {
    const { session } = mockSession();
    const { result } = renderHook(() => useImportSession(session));

    await act(async () => {
      result.current.cancel();
    });
    expect(result.current.state).toBe("cancelled");
  });

  it("zip entries are discovered and matched", async () => {
    const { session } = mockSession();
    const { result } = renderHook(() => useImportSession(session));
    // build a tiny zip in-memory
    const { zipSync, strToU8 } = await import("fflate");
    const zipBytes = zipSync({ "arrow-chevron-right.svg": strToU8("<svg></svg>") });
    const zipFile = new File([zipBytes as unknown as BlobPart], "icons.zip", { type: "application/zip" });

    await act(async () => {
      await result.current.scanFiles([zipFile]);
    });
    expect(result.current.candidates.length).toBe(1);
    expect(result.current.candidates[0]?.fileName).toBe("arrow-chevron-right.svg");
    expect(result.current.matches).toHaveLength(1);
  });

  it("apply does nothing when a decision references an unknown icon id", async () => {
    const { session, assignFile } = mockSession();
    const { result } = renderHook(() => useImportSession(session));

    await act(async () => {
      await result.current.scanFiles([svgFile("unknown.svg")]);
    });
    await act(async () => {
      result.current.resolveConflict("candidate-0", "does-not-exist");
    });
    await act(async () => {
      await result.current.apply();
    });
    // no assignment attempted for an invalid target
    expect(assignFile).not.toHaveBeenCalled();
  });
});
