import { useRef, useState } from "react";

/**
 * Bulk-import dropzone. Accepts multiple files (and directories when the
 * browser supports webkitdirectory). Delegates all parsing/validation to the
 * import session; this component only gathers files and drives state.
 */
export function BulkImportDropzone({
  onFiles,
  busy,
  supportsDirectory,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
  supportsDirectory?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const directorySupported = supportsDirectory ?? "webkitdirectory" in HTMLInputElement.prototype;

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    onFiles(Array.from(list));
  };

  return (
    <div
      className={`bulk-import-dropzone ${dropActive ? "drop-active" : ""} ${busy ? "busy" : ""}`}
      data-testid="bulk-import-dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropActive(false);
        if (busy) return;
        handleFiles(e.dataTransfer.files);
      }}
    >
      <p className="bulk-import-title">Bulk import</p>
      <p className="bulk-import-hint">
        Drop multiple SVG/XML files, a folder, or a ZIP archive. Names are matched
        exactly to canonical icon ids.
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        data-testid="bulk-import-button"
      >
        {busy ? "Importing…" : "Choose files / folder"}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".svg,.xml,image/svg+xml,.zip,application/zip"
        style={{ display: "none" }}
        {...(directorySupported ? { webkitdirectory: "" as unknown } : {})}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
