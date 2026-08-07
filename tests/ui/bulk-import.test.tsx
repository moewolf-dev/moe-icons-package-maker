import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkImportDropzone } from "../../src/ui/components/bulk-import-dropzone";
import { ImportConflictPanel } from "../../src/ui/components/import-conflict-panel";
import type { ImportConflict, ImportCandidate } from "../../src/import/types";

const CANDIDATES: ImportCandidate[] = [
  { opaqueId: "candidate-0", fileName: "arrow-chevron-right.svg", size: 10, mimeType: "image/svg+xml" },
  { opaqueId: "candidate-1", fileName: "user-circle.svg", size: 10, mimeType: "image/svg+xml" },
];

describe("BulkImportDropzone", () => {
  it("renders a multiple-file input and reports files on change", async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    render(<BulkImportDropzone onFiles={onFiles} busy={false} />);
    const input = document.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const f1 = new File(["x"], "a.svg", { type: "image/svg+xml" });
    const f2 = new File(["y"], "b.svg", { type: "image/svg+xml" });
    await user.upload(input, [f1, f2]);
    expect(onFiles).toHaveBeenCalledTimes(1);
    const files = onFiles.mock.calls[0]?.[0] as File[];
    expect(files.map((f) => f.name)).toEqual(["a.svg", "b.svg"]);
  });

  it("shows webkitdirectory support when available", () => {
    const { container } = render(<BulkImportDropzone onFiles={vi.fn()} busy={false} supportsDirectory={false} />);
    // when unsupported, no directory input attribute is rendered
    const input = container.querySelector('input[type="file"]');
    expect(input?.hasAttribute("webkitdirectory")).toBe(false);
  });

  it("blocks file selection while busy", async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    render(<BulkImportDropzone onFiles={onFiles} busy={true} />);
    const button = screen.getByTestId("bulk-import-button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

describe("ImportConflictPanel", () => {
  it("shows unmatched files with a decision input", () => {
    const conflicts: ImportConflict[] = [
      { code: "UNMATCHED_FILE", candidateId: "candidate-1", message: "no exact match" },
    ];
    const onResolve = vi.fn();
    render(
      <ImportConflictPanel
        candidates={CANDIDATES}
        conflicts={conflicts}
        decisions={{}}
        onResolve={onResolve}
      />,
    );
    expect(screen.getByText("user-circle.svg")).toBeTruthy();
    const input = screen.getByLabelText("Map user-circle.svg to icon id");
    fireEvent.change(input, { target: { value: "user-circle" } });
    expect(onResolve).toHaveBeenCalledWith("candidate-1", "user-circle");
  });

  it("shows duplicate-target conflicts without a decision input", () => {
    const conflicts: ImportConflict[] = [
      { code: "DUPLICATE_TARGET", candidateId: "candidate-0", iconId: "arrow-chevron-right", message: "multiple sources" },
    ];
    const { queryByLabelText } = render(
      <ImportConflictPanel
        candidates={CANDIDATES}
        conflicts={conflicts}
        decisions={{}}
        onResolve={() => undefined}
      />,
    );
    expect(screen.getByText("multiple sources")).toBeTruthy();
    expect(queryByLabelText("Map arrow-chevron-right.svg to icon id")).toBeNull();
  });

  it("renders empty state when no conflicts", () => {
    render(
      <ImportConflictPanel
        candidates={CANDIDATES}
        conflicts={[]}
        decisions={{}}
        onResolve={() => undefined}
      />,
    );
    expect(screen.getByText("No conflicts.")).toBeTruthy();
  });
});
