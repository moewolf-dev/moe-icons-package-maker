import { describe, it, expect, beforeEach } from "vitest";
import { IndexedDbProjectRepository, MAKER_DB_NAME } from "../src/storage/indexeddb-project-repository";
import { createProjectMetadata } from "../src/storage/memory-project-repository";
import type { MakerProjectDraft, ProjectBlob, ProjectRepository } from "../src/contracts/project";

// fake-indexeddb provides a spec-compliant in-memory IndexedDB for Node tests.
import "fake-indexeddb/auto";

function draft(name: string): MakerProjectDraft {
  return {
    metadata: createProjectMetadata(name),
    selectedIds: ["arrow-chevron-right"],
    groupMetadata: { groupId: "g", displayName: name, styleId: "outline", author: "", email: "", source: "", license: "" },
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

describe("IndexedDbProjectRepository", () => {
  let repo: ProjectRepository;

  beforeEach(() => {
    repo = new IndexedDbProjectRepository(Promise.resolve(openFresh()));
  });

  function openFresh(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(MAKER_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "metadata.id" });
        if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  it("create/list/get round-trip", async () => {
    await repo.create(draft("One"));
    const list = await repo.list();
    expect(list).toHaveLength(1);
    const got = await repo.get(list[0]?.id ?? "");
    expect(got.metadata.name).toBe("One");
  });

  it("blob put/get/delete lifecycle", async () => {
    await repo.create(draft("A"));
    const list = await repo.list();
    const id = list[0]?.id ?? "";
    await repo.putBlob(blob(id, "blob-1"));
    const got = await repo.getBlob(id, "blob-1");
    expect(got.size).toBe(10);
    await repo.deleteBlob(id, "blob-1");
    await expect(repo.getBlob(id, "blob-1")).rejects.toBeTruthy();
  });

  it("delete removes project and orphan blobs", async () => {
    await repo.create(draft("A"));
    const list = await repo.list();
    const id = list[0]?.id ?? "";
    await repo.putBlob(blob(id, "blob-1"));
    await repo.delete(id);
    await expect(repo.get(id)).rejects.toBeTruthy();
    await expect(repo.getBlob(id, "blob-1")).rejects.toBeTruthy();
  });

  it("duplicate copies blobs independently", async () => {
    await repo.create(draft("A"));
    const list = await repo.list();
    const id = list[0]?.id ?? "";
    await repo.putBlob(blob(id, "blob-1"));
    const copy = await repo.duplicate(id, "A copy");
    expect(copy.metadata.name).toBe("A copy");
    const copyBlob = await repo.getBlob(copy.metadata.id, copy.blobRefs[0]?.blobId ?? "");
    expect(copyBlob).toBeTruthy();
    await repo.delete(id);
    await expect(repo.get(copy.metadata.id)).resolves.toBeTruthy();
  });
});
