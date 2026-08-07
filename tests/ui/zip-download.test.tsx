import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMakerSession } from "../../src/ui/use-maker-session";
import { parseIconCatalog } from "../../src/catalog/catalog";
import { unzipSync } from "fflate";

const CATALOG = {
  schemaVersion: 1,
  icons: [
    { id: "arrow-chevron-right", subgroupId: "arrow", label: "Arrow", aliases: [], addedAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" },
    { id: "user-circle", subgroupId: "user", label: "User", aliases: [], addedAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" },
  ],
};

const VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';

function file(name: string, content: string): File {
  return new File([content], name, { type: "image/svg+xml" });
}

function useBuilder() {
  const parsed = parseIconCatalog(CATALOG);
  if (!parsed.ok) throw new Error("bad catalog");
  const { result } = renderHook(() => useMakerSession(parsed.value));
  return result;
}

async function assignAndBuild(
  result: { current: ReturnType<typeof useMakerSession> },
  id: string,
  svgFile: File,
) {
  await act(async () => {
    await result.current.assignFile(id, svgFile);
  });
  await act(async () => {
    await result.current.build();
  });
  await waitFor(() => expect(result.current.buildStatus).toBe("success"));
}

describe("PMUI-17 deterministic ZIP artifact", () => {
  it("same input produces identical ZIP bytes and checksum twice", async () => {
    const result = useBuilder();
    const svg = file("a.svg", VALID_SVG);

    await assignAndBuild(result, "arrow-chevron-right", svg);
    const first = result.current.buildResult;
    expect(first?.zipChecksum.length).toBe(64);
    const firstBytes = first ? Array.from(first.zipBytes) : [];

    // rebuild with byte-identical inputs (no state change)
    await assignAndBuild(result, "arrow-chevron-right", svg);
    const second = result.current.buildResult;
    const secondBytes = second ? Array.from(second.zipBytes) : [];

    expect(firstBytes).toEqual(secondBytes);
    expect(second?.zipChecksum).toBe(first?.zipChecksum);
  });

  it("ZIP contains svg, manifest.json, and report.json", async () => {
    const result = useBuilder();
    await assignAndBuild(result, "arrow-chevron-right", file("a.svg", VALID_SVG));
    const artifact = result.current.buildResult;
    expect(artifact).toBeTruthy();
    const unzipped = unzipSync(artifact?.zipBytes ?? new Uint8Array());
    const names = Object.keys(unzipped);
    expect(names).toContain("arrow/arrow-chevron-right.svg");
    expect(names).toContain("manifest.json");
    expect(names).toContain("report.json");
  });

  it("changing metadata clears the previous artifact", async () => {
    const result = useBuilder();
    await assignAndBuild(result, "arrow-chevron-right", file("a.svg", VALID_SVG));
    expect(result.current.buildResult).toBeTruthy();
    await act(async () => {
      result.current.setMetadata({ groupId: "new-group" });
    });
    expect(result.current.buildResult).toBeUndefined();
  });
});
