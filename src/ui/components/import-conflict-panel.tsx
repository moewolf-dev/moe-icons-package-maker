import type { ImportCandidate, ImportConflict } from "../../import/types";

/**
 * Conflict panel: lists every unresolved import conflict with the source file,
 * the conflict code, and (for unmatched files) an icon-id selector so the user
 * can map a file to a canonical icon or skip it.
 */
export function ImportConflictPanel({
  candidates,
  conflicts,
  decisions,
  onResolve,
}: {
  candidates: readonly ImportCandidate[];
  conflicts: readonly ImportConflict[];
  decisions: Readonly<Record<string, string>>;
  onResolve: (candidateId: string, iconId: string) => void;
}) {
  const candidateById = new Map(candidates.map((c) => [c.opaqueId, c]));

  return (
    <div className="import-conflict-panel" data-testid="import-conflict-panel">
      <h3>Import conflicts</h3>
      {conflicts.length === 0 ? (
        <p>No conflicts.</p>
      ) : (
        <ul className="import-conflicts">
          {conflicts.map((conflict, i) => {
            const candidate = candidateById.get(conflict.candidateId);
            return (
              <li key={`${conflict.candidateId}-${i}`} data-conflict-code={conflict.code}>
                <span className="conflict-file">{candidate?.fileName ?? conflict.candidateId}</span>
                <code>{conflict.code}</code>
                <span>{conflict.message}</span>
                {conflict.code === "UNMATCHED_FILE" && candidate && (
                  <div className="conflict-decision">
                    <label>
                      Map to icon
                      <input
                        type="text"
                        aria-label={`Map ${candidate.fileName} to icon id`}
                        value={decisions[conflict.candidateId] ?? ""}
                        placeholder="canonical-icon-id"
                        onChange={(e) => onResolve(conflict.candidateId, e.target.value)}
                      />
                    </label>
                    {decisions[conflict.candidateId] && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => onResolve(conflict.candidateId, "")}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
