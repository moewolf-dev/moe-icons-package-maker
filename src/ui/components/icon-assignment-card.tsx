import { useRef, useState } from "react";
import type { IconDefinition } from "../../contracts/types";

/**
 * IconAssignmentCard receives icon, reference preview, assignment, and
 * callbacks onChoose/onDrop/onRemove. A failed replacement keeps the old
 * preview (the parent retains the prior assignment). A reference image that
 * fails to load degrades to a text placeholder, never a broken image.
 */
export function IconAssignmentCard({
  icon,
  assignment,
  referencePreview,
  onChoose,
  onRemove,
  onRemoveSlot,
}: {
  icon: IconDefinition;
  assignment: { source: string | undefined; previewUrl?: string } | undefined;
  referencePreview?: string | undefined;
  onChoose: (file: File) => Promise<{ ok: boolean; errors: readonly string[] }>;
  onRemove: () => void;
  onRemoveSlot?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [dropActive, setDropActive] = useState(false);
  const [referenceFailed, setReferenceFailed] = useState(false);

  const source = assignment?.source;
  const filled = source !== undefined;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await onChoose(file);
      if (!result.ok && result.errors.length > 0) {
        setError(result.errors[0]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to read this file");
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      data-testid={`icon-card-${icon.id}`}
      className={`icon-card ${dropActive ? "drop-active" : ""} ${filled ? "filled" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropActive(false);
        void handleFile(e.dataTransfer.files[0]);
      }}
    >
      <div className="icon-card-copy">
        <span className="icon-card-name">{icon.label}</span>
        <code>{icon.id}</code>
        <span className="icon-card-subgroup">{icon.subgroupId}</span>
      </div>
      <div className="icon-card-previews">
        <span className="preview-tile" data-testid={`reference-${icon.id}`} aria-label={`Reference preview for ${icon.id}`}>
          <small>Official</small>
          {referencePreview && !referenceFailed ? (
            <img src={referencePreview} alt="" onError={() => setReferenceFailed(true)} />
          ) : (
            <span className="preview-fallback" data-testid={`reference-fallback-${icon.id}`} aria-hidden="true">
              Reference unavailable
            </span>
          )}
        </span>
        <span className={`preview-tile ${filled ? "has-image" : ""}`}>
          <small>Your SVG</small>
          {assignment?.previewUrl ? <img src={assignment.previewUrl} alt="" /> : <span aria-hidden="true">+</span>}
        </span>
      </div>
      {filled ? (
        <span className="icon-card-status" data-testid={`status-${icon.id}`}>
          {source}
        </span>
      ) : (
        <span className="icon-card-status empty" data-testid={`status-${icon.id}`}>
          empty
        </span>
      )}
      {error && (
        <span className="icon-card-error" data-testid={`error-${icon.id}`}>
          {error}
        </span>
      )}
      <div className="icon-card-actions">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          aria-label={`Choose SVG for ${icon.id}`}
        >
          {pending ? "Checking…" : filled ? "Replace" : "Choose SVG"}
        </button>
        {filled && (
          <button type="button" className="secondary" onClick={onRemove} aria-label={`Remove ${icon.id}`}>
            Remove
          </button>
        )}
        {onRemoveSlot && (
          <button type="button" className="danger" onClick={onRemoveSlot} aria-label={`Remove from group ${icon.id}`}>
            Remove from group
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".svg,.xml,image/svg+xml"
        style={{ display: "none" }}
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
