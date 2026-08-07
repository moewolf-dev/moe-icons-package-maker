import { useState } from "react";
import type { ProjectDialogKind } from "../use-project-controller";

/**
 * Modal dialog for create / rename / duplicate / delete / open project
 * operations. All operations are keyboard-operable; delete requires typing the
 * project name as confirmation.
 */
export function ProjectDialog({
  kind,
  projectName,
  onSubmit,
  onClose,
}: {
  kind: ProjectDialogKind;
  projectName?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState("");
  const isDelete = kind === "delete";
  const okDisabled = isDelete
    ? confirm !== projectName
    : name.trim().length === 0;

  const submit = () => {
    if (okDisabled) return;
    onSubmit(isDelete ? confirm : name.trim());
  };

  return (
    <div className="project-dialog-backdrop" data-testid="project-dialog">
      <div className="project-dialog" role="dialog" aria-modal="true" aria-label={`${kind} project`}>
        <h3>{kind} project</h3>
        {isDelete ? (
          <>
            <p>
              Type <strong>{projectName}</strong> to confirm deletion. This cannot be undone.
            </p>
            <label>
              Project name
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-label="Confirm project name"
                data-testid="dialog-confirm-input"
              />
            </label>
          </>
        ) : (
          <label>
            Project name
            <input
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "create" ? "e.g. My Custom Icons" : projectName}
              aria-label="Project name"
              data-testid="dialog-name-input"
            />
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={submit} disabled={okDisabled} data-testid="dialog-ok">
            {kind === "delete" ? "Delete" : "OK"}
          </button>
          <button type="button" className="secondary" onClick={onClose} data-testid="dialog-cancel">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
