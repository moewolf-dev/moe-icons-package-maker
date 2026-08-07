import type {
  MakerProjectDraft,
  MakerProjectMetadata,
  ProjectBlob,
  ProjectListEntry,
  ProjectRepository,
} from "../contracts/project";
import { ProjectError } from "../contracts/project";
import { MAKER_PROJECT_SCHEMA_VERSION } from "../contracts/project";

/**
 * In-memory project repository. Shares the exact contract as the IndexedDB
 * repository so both are covered by the same contract tests. Useful for the
 * website embedding (per-session state) and tests.
 */

function assertSchema(draft: MakerProjectDraft): void {
  if (draft.metadata.schemaVersion !== MAKER_PROJECT_SCHEMA_VERSION) {
    throw new ProjectError(
      "SCHEMA_UNSUPPORTED",
      `unsupported project schema version ${draft.metadata.schemaVersion}`,
    );
  }
}

export function createProjectMetadata(name: string, id?: string): MakerProjectMetadata {
  const now = new Date().toISOString();
  return {
    id: id ?? `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    schemaVersion: MAKER_PROJECT_SCHEMA_VERSION,
    catalogSchemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export class MemoryProjectRepository implements ProjectRepository {
  private drafts = new Map<string, MakerProjectDraft>();
  private blobs = new Map<string, ProjectBlob>();

  private blobKey(projectId: string, blobId: string): string {
    return `${projectId}/${blobId}`;
  }

  async list(): Promise<readonly ProjectListEntry[]> {
    await Promise.resolve();
    return [...this.drafts.values()]
      .map((d) => ({ id: d.metadata.id, name: d.metadata.name, updatedAt: d.metadata.updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<MakerProjectDraft> {
    await Promise.resolve();
    const draft = this.drafts.get(id);
    if (!draft) throw new ProjectError("NOT_FOUND", `project "${id}" not found`);
    return structuredClone(draft);
  }

  async create(draft: MakerProjectDraft): Promise<void> {
    await Promise.resolve();
    assertSchema(draft);
    if (this.drafts.has(draft.metadata.id)) {
      throw new ProjectError("ALREADY_EXISTS", `project "${draft.metadata.id}" already exists`);
    }
    this.drafts.set(draft.metadata.id, structuredClone(draft));
  }

  async save(draft: MakerProjectDraft): Promise<void> {
    await Promise.resolve();
    assertSchema(draft);
    if (!this.drafts.has(draft.metadata.id)) {
      throw new ProjectError("NOT_FOUND", `project "${draft.metadata.id}" not found`);
    }
    this.drafts.set(draft.metadata.id, structuredClone(draft));
  }

  async delete(id: string): Promise<void> {
    await Promise.resolve();
    if (!this.drafts.delete(id)) {
      throw new ProjectError("NOT_FOUND", `project "${id}" not found`);
    }
    // remove orphan blobs belonging to this project
    for (const key of [...this.blobs.keys()]) {
      if (key.startsWith(`${id}/`)) this.blobs.delete(key);
    }
  }

  async duplicate(id: string, newName: string): Promise<MakerProjectDraft> {
    await Promise.resolve();
    const original = this.drafts.get(id);
    if (!original) throw new ProjectError("NOT_FOUND", `project "${id}" not found`);
    const now = new Date().toISOString();
    const newId = `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // remap blob ids for the copy
    const idMap = new Map<string, string>();
    for (const ref of original.blobRefs) {
      idMap.set(ref.blobId, `${newId}-${ref.blobId}`);
    }
    const mapping: Record<string, string> = {};
    for (const [iconId, blobKey] of Object.entries(original.mapping)) {
      mapping[iconId] = idMap.get(blobKey) ?? blobKey;
    }
    const blobRefs = original.blobRefs.map((ref) => ({
      ...ref,
      blobId: idMap.get(ref.blobId) ?? ref.blobId,
    }));

    const copy: MakerProjectDraft = {
      ...original,
      metadata: {
        ...original.metadata,
        id: newId,
        name: newName,
        createdAt: now,
        updatedAt: now,
      },
      mapping,
      blobRefs,
    };

    // copy blobs under the new project id
    for (const [originalBlobId, newBlobId] of idMap) {
      const source = this.blobs.get(this.blobKey(id, originalBlobId));
      if (source) {
        this.blobs.set(this.blobKey(newId, newBlobId), { ...source, projectId: newId, blobId: newBlobId });
      }
    }

    this.drafts.set(newId, structuredClone(copy));
    return this.get(newId);
  }

  async getBlob(projectId: string, blobId: string): Promise<ProjectBlob> {
    await Promise.resolve();
    const blob = this.blobs.get(this.blobKey(projectId, blobId));
    if (!blob) throw new ProjectError("NOT_FOUND", `blob "${blobId}" not found`);
    return { ...blob };
  }

  async putBlob(blob: ProjectBlob): Promise<void> {
    await Promise.resolve();
    if (!this.drafts.has(blob.projectId)) {
      throw new ProjectError("NOT_FOUND", `project "${blob.projectId}" not found`);
    }
    this.blobs.set(this.blobKey(blob.projectId, blob.blobId), { ...blob });
  }

  async deleteBlob(projectId: string, blobId: string): Promise<void> {
    await Promise.resolve();
    this.blobs.delete(this.blobKey(projectId, blobId));
  }

  async getUsage(): Promise<{ blobBytes: number; projectCount: number }> {
    await Promise.resolve();
    let blobBytes = 0;
    for (const blob of this.blobs.values()) blobBytes += blob.size;
    return { blobBytes, projectCount: this.drafts.size };
  }
}
