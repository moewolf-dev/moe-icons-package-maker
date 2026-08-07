import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useProjectController } from "../../src/ui/use-project-controller";
import { MemoryProjectRepository, createProjectMetadata } from "../../src/storage/memory-project-repository";
import type { MakerSession } from "../../src/ui/use-maker-session";
import type { MakerProjectDraft } from "../../src/contracts/project";

function mockSession(overrides: Partial<MakerSession> = {}): MakerSession {
  return {
    catalog: { schemaVersion: 1, icons: [] },
    index: { byId: new Map(), bySubgroup: new Map(), byToken: new Map(), order: [] },
    selectedIds: [],
    assignments: [],
    previewUrls: new Map(),
    metadata: { groupId: "", displayName: "", styleId: "outline", author: "", email: "", source: "", license: "" },
    validation: [],
    validationByIcon: new Map(),
    progress: { selected: 0, filled: 0, missing: 0, valid: 0, warnings: 0, errors: 0 },
    missing: [],
    dirty: false,
    buildStatus: "idle",
    buildError: undefined,
    buildResult: undefined,
    partialAcknowledged: false,
    fallbackPolicy: "fallback" as const,
    toggleSelect: vi.fn(),
    setQuery: () => [],
    assignFile: async () => ({ ok: true, errors: [] }),
    removeAssignment: vi.fn(),
    removeSlot: vi.fn(),
    setMetadata: vi.fn(),
    setPartialAcknowledged: vi.fn(),
    setFallbackPolicy: vi.fn(),
    build: async () => undefined,
    reset: vi.fn(),
    toDraft: () => ({
      metadata: { id: "", name: "", schemaVersion: 1, catalogSchemaVersion: 1, createdAt: "x", updatedAt: "x" },
      selectedIds: [],
      groupMetadata: { groupId: "", displayName: "", styleId: "outline", author: "", email: "", source: "", license: "" },
      fallbackPolicy: "fallback" as const,
      mapping: {},
      blobRefs: [],
    }),
    restoreFromDraft: vi.fn(),
    ...overrides,
  } as unknown as MakerSession;
}

describe("useProjectController", () => {
  let repo: MemoryProjectRepository;

  beforeEach(() => {
    repo = new MemoryProjectRepository();
  });

  it("lists existing projects on mount", async () => {
    const draft = {
      metadata: createProjectMetadata("Existing"),
      selectedIds: [],
      groupMetadata: { groupId: "", displayName: "", styleId: "outline", author: "", email: "", source: "", license: "" },
      fallbackPolicy: "fallback" as const,
      mapping: {},
      blobRefs: [],
    };
    await repo.create(draft);
    const session = mockSession();
    const { result } = renderHook(() => useProjectController(repo, session));
    await waitFor(() => expect(result.current.projects.length).toBe(1));
    expect(result.current.projects[0]?.name).toBe("Existing");
  });

  it("creates a project and sets it current", async () => {
    const session = mockSession();
    const { result } = renderHook(() => useProjectController(repo, session));
    await act(async () => {
      await result.current.createProject("My Group");
    });
    expect(result.current.currentProjectId).toBeTruthy();
    expect(result.current.currentName).toBe("My Group");
    expect((await repo.list()).length).toBe(1);
  });

  it("autosaves the session draft after a debounce when dirty", async () => {
    const saveSpy = vi.spyOn(repo, "save");
    const session = mockSession({ dirty: true });
    const { result } = renderHook(() => useProjectController(repo, session));
    await act(async () => {
      await result.current.createProject("Auto");
    });
    // dirty session triggers a debounced save
    await waitFor(() => expect(saveSpy).toHaveBeenCalled());
  });

  it("openProject restores session state", async () => {
    const draft = {
      metadata: createProjectMetadata("Open Me"),
      selectedIds: ["arrow-chevron-right"],
      groupMetadata: { groupId: "g", displayName: "Open Me", styleId: "outline", author: "", email: "", source: "", license: "" },
      fallbackPolicy: "error" as const,
      mapping: { "arrow-chevron-right": "blob-1" },
      blobRefs: [],
    };
    await repo.create(draft);
    const restore = vi.fn();
    const session = mockSession({ restoreFromDraft: restore });
    const { result } = renderHook(() => useProjectController(repo, session));
    await act(async () => {
      await result.current.openProject(draft.metadata.id);
    });
    expect(restore).toHaveBeenCalled();
    expect(result.current.currentName).toBe("Open Me");
  });

  it("deleteProject removes the project and resets a deleted current project", async () => {
    const session = mockSession({ reset: vi.fn() });
    const { result } = renderHook(() => useProjectController(repo, session));
    await act(async () => {
      await result.current.createProject("To Delete");
    });
    const id = result.current.currentProjectId ?? "";
    await act(async () => {
      await result.current.deleteProject(id);
    });
    expect(result.current.currentProjectId).toBeUndefined();
    expect((await repo.list()).length).toBe(0);
  });

  it("surface save errors and keep the error visible", async () => {
    const session = mockSession({ dirty: true });
    const failing = {
      ...repo,
      save: vi.fn(async () => {
        throw new Error("quota exceeded");
      }),
    } as unknown as MemoryProjectRepository;
    const { result } = renderHook(() => useProjectController(failing, session));
    await act(async () => {
      await result.current.createProject("Err");
    });
    await waitFor(() => expect(result.current.saveError).toBeTruthy());
  });

  it("dialog open/close works", () => {
    const session = mockSession();
    const { result } = renderHook(() => useProjectController(repo, session));
    act(() => result.current.openDialog("create"));
    expect(result.current.dialog).toBe("create");
    act(() => result.current.closeDialog());
    expect(result.current.dialog).toBe("none");
  });

  it("flushNow persists the pending draft immediately", async () => {
    const session = mockSession({ dirty: true });
    const { result } = renderHook(() => useProjectController(repo, session));
    await act(async () => {
      await result.current.createProject("Flush");
    });
    const saveSpy = vi.spyOn(repo, "save");
    await act(async () => {
      await result.current.flushNow();
    });
    expect(saveSpy).toHaveBeenCalled();
  });
});
