import { useCallback, useEffect, useRef, useState } from "react";
import type { MakerSession } from "./use-maker-session";
import type {
  MakerProjectDraft,
  ProjectListEntry,
  ProjectRepository,
} from "../contracts/project";
import { createProjectMetadata } from "../storage/memory-project-repository";

/**
 * Local project management + autosave. Owns the repository, the current
 * project id, and debounced persistence of the session draft. First launch
 * shows a create/open choice; switching away from a dirty project waits for a
 * save or an explicit discard. Save errors stay visible and keep the dirty bit.
 */

export type ProjectDialogKind = "none" | "create" | "rename" | "duplicate" | "delete" | "open";

export interface ProjectController {
  readonly projects: readonly ProjectListEntry[];
  readonly currentProjectId: string | undefined;
  readonly currentName: string;
  readonly dirty: boolean;
  readonly saveError: string | undefined;
  readonly saving: boolean;
  readonly dialog: ProjectDialogKind;
  readonly dialogProject: ProjectListEntry | undefined;
  openDialog(kind: ProjectDialogKind, project?: ProjectListEntry): void;
  closeDialog(): void;
  createProject(name: string): Promise<void>;
  renameProject(projectId: string, name: string): Promise<void>;
  duplicateProject(projectId: string, name: string): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  openProject(projectId: string): Promise<void>;
  flushNow(): Promise<void>;
}

export function useProjectController(
  repository: ProjectRepository,
  session: MakerSession,
): ProjectController {
  const [projects, setProjects] = useState<readonly ProjectListEntry[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | undefined>(undefined);
  const [currentName, setCurrentName] = useState("Untitled");
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<ProjectDialogKind>("none");
  const [dialogProject, setDialogProject] = useState<ProjectListEntry | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingRef = useRef<{ id: string; draft: MakerProjectDraft } | undefined>(undefined);

  const refreshProjects = useCallback(async () => {
    try {
      const list = await repository.list();
      setProjects(list);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }, [repository]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  // Autosave with 500ms debounce; a change during the pending save schedules
  // the next one so the last mutation is never lost.
  useEffect(() => {
    if (currentProjectId === undefined || !session.dirty) return;
    const draft = session.toDraft();
    const projectId = currentProjectId;
    pendingRef.current = { id: projectId, draft };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void (async () => {
        const pending = pendingRef.current;
        pendingRef.current = undefined;
        if (!pending || pending.id !== projectId) return;
        setSaving(true);
        setSaveError(undefined);
        try {
          const stored = await repository.get(pending.id);
          const merged: MakerProjectDraft = {
            ...pending.draft,
            metadata: { ...stored.metadata, updatedAt: new Date().toISOString() },
          };
          await repository.save(merged);
          setCurrentName(stored.metadata.name);
          void refreshProjects();
        } catch (error) {
          setSaveError(error instanceof Error ? error.message : String(error));
        } finally {
          setSaving(false);
        }
      })();
    }, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentProjectId, session.dirty, session, repository, refreshProjects]);

  const openDialog = useCallback((kind: ProjectDialogKind, project?: ProjectListEntry) => {
    setDialog(kind);
    setDialogProject(project);
  }, []);

  const closeDialog = useCallback(() => {
    setDialog("none");
    setDialogProject(undefined);
  }, []);

  const createProject = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const draft = session.toDraft();
      const metadata = createProjectMetadata(trimmed);
      const full: MakerProjectDraft = { ...draft, metadata };
      try {
        await repository.create(full);
        setCurrentProjectId(metadata.id);
        setCurrentName(trimmed);
        setSaveError(undefined);
        setDialog("none");
        void refreshProjects();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error));
      }
    },
    [repository, session, refreshProjects],
  );

  const openProject = useCallback(
    async (projectId: string) => {
      try {
        const draft = await repository.get(projectId);
        session.restoreFromDraft(draft);
        setCurrentProjectId(projectId);
        setCurrentName(draft.metadata.name);
        setSaveError(undefined);
        setDialog("none");
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error));
      }
    },
    [repository, session],
  );

  const renameProject = useCallback(
    async (projectId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        const draft = await repository.get(projectId);
        const renamed: MakerProjectDraft = {
          ...draft,
          metadata: { ...draft.metadata, name: trimmed, updatedAt: new Date().toISOString() },
        };
        await repository.save(renamed);
        if (projectId === currentProjectId) setCurrentName(trimmed);
        setDialog("none");
        void refreshProjects();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error));
      }
    },
    [repository, currentProjectId, refreshProjects],
  );

  const duplicateProject = useCallback(
    async (projectId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        await repository.duplicate(projectId, trimmed);
        setDialog("none");
        void refreshProjects();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error));
      }
    },
    [repository, refreshProjects],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      try {
        await repository.delete(projectId);
        if (projectId === currentProjectId) {
          setCurrentProjectId(undefined);
          setCurrentName("Untitled");
          session.reset();
        }
        setDialog("none");
        void refreshProjects();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error));
      }
    },
    [repository, currentProjectId, session, refreshProjects],
  );

  const flushNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const pending = pendingRef.current;
    pendingRef.current = undefined;
    if (!pending || currentProjectId === undefined) return;
    setSaving(true);
    try {
      const stored = await repository.get(pending.id);
      const merged: MakerProjectDraft = {
        ...pending.draft,
        metadata: { ...stored.metadata, updatedAt: new Date().toISOString() },
      };
      await repository.save(merged);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [repository, currentProjectId]);

  // The repository is injected by the embedder (IndexedDB locally, memory in
  // tests/embedding). No default is created here.

  return {
    projects,
    currentProjectId,
    currentName,
    dirty: session.dirty,
    saveError,
    saving,
    dialog,
    dialogProject,
    openDialog,
    closeDialog,
    createProject,
    renameProject,
    duplicateProject,
    deleteProject,
    openProject,
    flushNow,
  };
}
