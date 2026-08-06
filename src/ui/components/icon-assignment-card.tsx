import { useRef, useState } from "react";
import type { IconDefinition } from "../../contracts/types";

/**
 * IconAssignmentCard receives icon, reference preview, assignment, and
 * callbacks onChoose/onDrop/onRemove. A failed replacement keeps the old
 * preview (the parent retains the prior assignment).
 */
export function IconAssignmentCard({
  icon,
  assignment,
  referencePreview,
  onChoose,
  onRemove,
}: {
  icon: IconDefinition;
  assignment: { source: string | undefined } | undefined;
  referencePreview?: string | undefined;
  onChoose: (file: File) => Promise<{ ok: boolean; errors: readonly string[] }>;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [dropActive, setDropActive] = useState(false);

  const source = assignment?.source;
  const filled = source !== undefined;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setPending(true);
    setError(undefined);
    const result = await onChoose(file);
    setPending(false);
    if (!result.ok && result.errors.length > 0) {
      setError(result.errors[0]);
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
      <span className="icon-card-name">{icon.id}</span>
      <span className="icon-card-subgroup">{icon.subgroupId}</span>
      {referencePreview && (
        <span
          className="icon-card-reference"
          data-testid={`reference-${icon.id}`}
          aria-label={`Reference preview for ${icon.id}`}
        >
          <img src={referencePreview} alt="" />
        </span>
      )}
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
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        aria-label={`Choose SVG for ${icon.id}`}
      >
        {filled ? "Replace" : "Choose"}
      </button>
      {filled && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${icon.id}`}
        >
          Remove
        </button>
      )}
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
