import { describe, it, expect } from "vitest";
import { MemoryProjectRepository, createProjectMetadata } from "../src/storage/memory-project-repository";
import { ProjectError } from "../src/contracts/project";
import type { MakerProjectDraft, ProjectRepository, ProjectBlob } from "../src/contracts/project";

function sampleDraft(repo: ProjectRepository, name: string, id?: string): MakerProjectDraft {
  return {
    metadata: createProjectMetadata(name, id),
    selectedIds: ["arrow-chevron-right"],
    groupMetadata: {
      groupId: "my-group",
      displayName: "My Group",
      styleId: "outline",
      author: "test",
      email: "",
      source: "",
      license: "MIT",
    },
    fallbackPolicy: "fallback",
    mapping: { "arrow-chevron-right": "blob-1" },
    blobRefs: [{ blobId: "blob-1", fileName: "a.svg", mimeType: "image/svg+xml", size: 10, sha256: "a".repeat(64) }],
  };
}

function blob(projectId: string, blobId: string): ProjectBlob {
  return {
    projectId,
    blobId,
    fileName: `${blobId}.svg`,
    mimeType: "image/svg+xml",
    size: 10,
    sha256: "a".repeat(64),
    blob: new Blob(["<svg></svg>"], { type: "image/svg+xml" }),
  };
}

function runSuite(name: string, makeRepo: () => Promise<ProjectRepository>) {
  describe(name, () => {
    it("create, list, get round-trip", async () => {
      const repo = await makeRepo();
      const draft = sampleDraft(repo, "Alpha");
      await repo.create(draft);
      const list = await repo.list();
      expect(list).toHaveLength(1);
      expect(list[0]?.name).toBe("Alpha");
      const got = await repo.get(draft.metadata.id);
      expect(got.metadata.name).toBe("Alpha");
    });

    it("create rejects duplicates", async () => {
      const repo = await makeRepo();
      const first = sampleDraft(repo, "A");
      await repo.create(first);
      const second = sampleDraft(repo, "A", first.metadata.id);
      await expect(repo.create(second)).rejects.toBeInstanceOf(ProjectError);
    });

    it("save updates and get reflects latest", async () => {
      const repo = await makeRepo();
      const draft = sampleDraft(repo, "A");
      await repo.create(draft);
      const updated: MakerProjectDraft = {
        ...draft,
        metadata: { ...draft.metadata, updatedAt: new Date().toISOString() },
        selectedIds: ["user-circle"],
      };
      await repo.save(updated);
      const got = await repo.get(draft.metadata.id);
      expect(got.selectedIds).toEqual(["user-circle"]);
    });

    it("get missing throws NOT_FOUND", async () => {
      const repo = await makeRepo();
      await expect(repo.get("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("delete removes project and orphan blobs", async () => {
      const repo = await makeRepo();
      const draft = sampleDraft(repo, "A");
      await repo.create(draft);
      await repo.putBlob(blob(draft.metadata.id, "blob-1"));
      await repo.delete(draft.metadata.id);
      await expect(repo.get(draft.metadata.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(repo.getBlob(draft.metadata.id, "blob-1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("duplicate creates an independent project with copied blobs", async () => {
      const repo = await makeRepo();
      const draft = sampleDraft(repo, "A");
      await repo.create(draft);
      await repo.putBlob(blob(draft.metadata.id, "blob-1"));
      const copy = await repo.duplicate(draft.metadata.id, "A copy");
      expect(copy.metadata.id).not.toBe(draft.metadata.id);
      expect(copy.metadata.name).toBe("A copy");
      // the copied project can retrieve its own blob
      const copyBlob = await repo.getBlob(copy.metadata.id, copy.blobRefs[0]?.blobId ?? "");
      expect(copyBlob).toBeTruthy();
      // deleting the original keeps the copy intact
      await repo.delete(draft.metadata.id);
      await expect(repo.get(copy.metadata.id)).resolves.toBeTruthy();
    });

    it("blob lifecycle: put/get/delete", async () => {
      const repo = await makeRepo();
      const draft = sampleDraft(repo, "A");
      await repo.create(draft);
      await repo.putBlob(blob(draft.metadata.id, "blob-1"));
      const got = await repo.getBlob(draft.metadata.id, "blob-1");
      expect(got.size).toBe(10);
      await repo.deleteBlob(draft.metadata.id, "blob-1");
      await expect(repo.getBlob(draft.metadata.id, "blob-1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("getUsage reports blob bytes and project count", async () => {
      const repo = await makeRepo();
      const draft = sampleDraft(repo, "A");
      await repo.create(draft);
      await repo.putBlob(blob(draft.metadata.id, "blob-1"));
      const usage = await repo.getUsage();
      expect(usage.projectCount).toBe(1);
      expect(usage.blobBytes).toBe(10);
    });

    it("unsupported schema version is rejected", async () => {
      const repo = await makeRepo();
      const draft = sampleDraft(repo, "A");
      const bad = { ...draft, metadata: { ...draft.metadata, schemaVersion: 99 } };
      await expect(repo.create(bad)).rejects.toMatchObject({ code: "SCHEMA_UNSUPPORTED" });
    });
  });
}

runSuite("MemoryProjectRepository", async () => new MemoryProjectRepository());
