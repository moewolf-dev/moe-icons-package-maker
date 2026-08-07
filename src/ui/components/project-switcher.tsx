import type { ProjectListEntry } from "../../contracts/project";

/**
 * Project switcher: lists saved local projects and offers create / open /
 * rename / duplicate / delete actions. Safe for keyboard-only operation.
 */
export function ProjectSwitcher({
  projects,
  currentProjectId,
  currentName,
  dirty,
  saving,
  onOpen,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
}: {
  projects: readonly ProjectListEntry[];
  currentProjectId: string | undefined;
  currentName: string;
  dirty: boolean;
  saving: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onRename: (project: ProjectListEntry) => void;
  onDuplicate: (project: ProjectListEntry) => void;
  onDelete: (project: ProjectListEntry) => void;
}) {
  return (
    <div className="project-switcher" data-testid="project-switcher">
      <div className="project-current">
        <span className="project-label">Project</span>
        <strong data-testid="project-current-name">{currentName}</strong>
        {dirty && <span className="project-dirty">● unsaved</span>}
        {saving && <span className="project-saving">saving…</span>}
      </div>
      <div className="project-actions">
        <button type="button" onClick={onCreate} data-testid="project-create">
          New
        </button>
        {projects.map((project) => (
          <span className="project-actions-group" key={project.id}>
            <button
              type="button"
              onClick={() => onOpen(project.id)}
              aria-current={project.id === currentProjectId ? "true" : undefined}
              data-testid={`project-open-${project.id}`}
            >
              {project.name}
            </button>
            <button type="button" className="secondary" onClick={() => onRename(project)} aria-label={`Rename ${project.name}`}>
              Rename
            </button>
            <button type="button" className="secondary" onClick={() => onDuplicate(project)} aria-label={`Duplicate ${project.name}`}>
              Duplicate
            </button>
            <button type="button" className="danger" onClick={() => onDelete(project)} aria-label={`Delete ${project.name}`}>
              Delete
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
