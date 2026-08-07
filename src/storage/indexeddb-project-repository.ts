import type {
  MakerProjectDraft,
  ProjectBlob,
  ProjectListEntry,
  ProjectRepository,
} from "../contracts/project";
import { ProjectError } from "../contracts/project";

/**
 * IndexedDB project repository. Database name embeds the major version so
 * schema changes create a new database instead of silently migrating. Object
 * stores are named explicitly below. `save` writes the draft and its blob
 * references in one transaction; a delete also removes orphan blobs.
 */

export const MAKER_DB_NAME = "moeicons-maker-project-v1";
export const DRAFT_STORE = "drafts";
export const BLOB_STORE = "blobs";
const DB_VERSION = 1;

export function openMakerDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new ProjectError("STORAGE_UNAVAILABLE", "IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(MAKER_DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: "metadata.id" });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new ProjectError("STORAGE_UNAVAILABLE", `failed to open ${MAKER_DB_NAME}: ${request.error?.message ?? "unknown"}`));
    request.onblocked = () =>
      reject(new ProjectError("BLOCKED_UPGRADE", "database upgrade blocked by an open connection"));
  });
}

function tx(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
): IDBTransaction {
  return db.transaction(stores, mode);
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new ProjectError("STORAGE_UNAVAILABLE", request.error?.message ?? "indexeddb error"));
  });
}

export class IndexedDbProjectRepository implements ProjectRepository {
  private readonly dbPromise: Promise<IDBDatabase>;

  constructor(db?: Promise<IDBDatabase>) {
    this.dbPromise = db ?? openMakerDatabase();
  }

  private async db(): Promise<IDBDatabase> {
    return this.dbPromise;
  }

  async list(): Promise<readonly ProjectListEntry[]> {
    const database = await this.db();
    const transaction = tx(database, [DRAFT_STORE], "readonly");
    const store = transaction.objectStore(DRAFT_STORE);
    const request = store.getAll();
    const drafts = await requestToPromise(request as IDBRequest<MakerProjectDraft[]>);
    return drafts
      .map((d) => ({ id: d.metadata.id, name: d.metadata.name, updatedAt: d.metadata.updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<MakerProjectDraft> {
    const database = await this.db();
    const store = database.transaction(DRAFT_STORE, "readonly").objectStore(DRAFT_STORE);
    const draft = await requestToPromise(store.get(id) as IDBRequest<MakerProjectDraft | undefined>);
    if (!draft) throw new ProjectError("NOT_FOUND", `project "${id}" not found`);
    return draft;
  }

  async create(draft: MakerProjectDraft): Promise<void> {
    await this.assertAbsent(draft.metadata.id);
    await this.save(draft);
  }

  private async assertAbsent(id: string): Promise<void> {
    const database = await this.db();
    const store = database.transaction(DRAFT_STORE, "readonly").objectStore(DRAFT_STORE);
    const existing = await requestToPromise(store.get(id) as IDBRequest<MakerProjectDraft | undefined>);
    if (existing) throw new ProjectError("ALREADY_EXISTS", `project "${id}" already exists`);
  }

  async save(draft: MakerProjectDraft): Promise<void> {
    const database = await this.db();
    const transaction = tx(database, [DRAFT_STORE], "readwrite");
    await new Promise<void>((resolve, reject) => {
      const store = transaction.objectStore(DRAFT_STORE);
      store.put(draft);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new ProjectError("QUOTA_EXCEEDED", transaction.error?.message ?? "save failed"));
      transaction.onabort = () =>
        reject(new ProjectError("STORAGE_UNAVAILABLE", "save transaction aborted"));
    });
  }

  async delete(id: string): Promise<void> {
    const database = await this.db();
    const transaction = tx(database, [DRAFT_STORE, BLOB_STORE], "readwrite");
    const draftStore = transaction.objectStore(DRAFT_STORE);
    const blobStore = transaction.objectStore(BLOB_STORE);
    const existing = await requestToPromise(draftStore.get(id) as IDBRequest<MakerProjectDraft | undefined>);
    if (!existing) {
      transaction.abort();
      throw new ProjectError("NOT_FOUND", `project "${id}" not found`);
    }
    // remove all blobs belonging to this project (keys are `projectId/blobId`)
    const allBlobs = await requestToPromise(blobStore.getAllKeys());
    for (const key of allBlobs) {
      if (typeof key === "string" && key.startsWith(`${id}/`)) {
        blobStore.delete(key);
      }
    }
    draftStore.delete(id);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new ProjectError("STORAGE_UNAVAILABLE", "delete failed"));
      transaction.onabort = () => reject(new ProjectError("STORAGE_UNAVAILABLE", "delete aborted"));
    });
  }

  async duplicate(id: string, newName: string): Promise<MakerProjectDraft> {
    const original = await this.get(id);
    const now = new Date().toISOString();
    const newId = `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const copy: MakerProjectDraft = {
      ...structuredClone(original),
      metadata: {
        ...original.metadata,
        id: newId,
        name: newName,
        createdAt: now,
        updatedAt: now,
      },
    };
    // copy blobs, remapping ids (build new immutable maps/arrays)
    const idMap = new Map<string, string>();
    for (const ref of copy.blobRefs) {
      const newBlobId = `${newId}-${ref.blobId}`;
      idMap.set(ref.blobId, newBlobId);
    }
    for (const [originalBlobId, newBlobId] of idMap) {
      const source = await this.getBlob(original.metadata.id, originalBlobId);
      await this.putBlob({ ...source, projectId: newId, blobId: newBlobId });
    }
    const mapping: Record<string, string> = {};
    for (const [iconId, key] of Object.entries(copy.mapping)) {
      mapping[iconId] = idMap.get(key) ?? key;
    }
    const blobRefs = copy.blobRefs.map((ref) => ({ ...ref, blobId: idMap.get(ref.blobId) ?? ref.blobId }));
    const finalCopy: MakerProjectDraft = { ...copy, mapping, blobRefs };
    await this.create(finalCopy);
    return this.get(finalCopy.metadata.id);
  }

  async getBlob(projectId: string, blobId: string): Promise<ProjectBlob> {
    const database = await this.db();
    const store = database.transaction(BLOB_STORE, "readonly").objectStore(BLOB_STORE);
    const key = `${projectId}/${blobId}`;
    const blob = await requestToPromise(store.get(key) as IDBRequest<ProjectBlob | undefined>);
    if (!blob) throw new ProjectError("NOT_FOUND", `blob "${blobId}" not found`);
    return blob;
  }

  async putBlob(blob: ProjectBlob): Promise<void> {
    const database = await this.db();
    const transaction = tx(database, [BLOB_STORE], "readwrite");
    await new Promise<void>((resolve, reject) => {
      const store = transaction.objectStore(BLOB_STORE);
      store.put({ ...blob, key: `${blob.projectId}/${blob.blobId}` } as unknown as { key: string });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new ProjectError("QUOTA_EXCEEDED", transaction.error?.message ?? "blob put failed"));
    });
  }

  async deleteBlob(projectId: string, blobId: string): Promise<void> {
    const database = await this.db();
    const store = database.transaction(BLOB_STORE, "readwrite").objectStore(BLOB_STORE);
    store.delete(`${projectId}/${blobId}`);
    await new Promise<void>((resolve) => {
      // fire-and-forget; no error surface for best-effort blob cleanup
      resolve();
    });
  }

  async getUsage(): Promise<{ blobBytes: number; projectCount: number }> {
    const database = await this.db();
    const blobs = await requestToPromise(
      database.transaction(BLOB_STORE, "readonly").objectStore(BLOB_STORE).getAll() as IDBRequest<ProjectBlob[]>,
    );
    const drafts = await requestToPromise(
      database.transaction(DRAFT_STORE, "readonly").objectStore(DRAFT_STORE).getAll() as IDBRequest<MakerProjectDraft[]>,
    );
    let blobBytes = 0;
    for (const b of blobs) blobBytes += b.size;
    return { blobBytes, projectCount: drafts.length };
  }
}
