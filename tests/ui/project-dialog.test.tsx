import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectSwitcher } from "../../src/ui/components/project-switcher";
import { ProjectDialog } from "../../src/ui/components/project-dialog";
import type { ProjectListEntry } from "../../src/contracts/project";

const PROJECTS: ProjectListEntry[] = [
  { id: "p1", name: "Alpha", updatedAt: "2026-08-06T00:00:00.000Z" },
  { id: "p2", name: "Beta", updatedAt: "2026-08-06T00:00:00.000Z" },
];

describe("ProjectSwitcher", () => {
  it("shows the current project and dirty/saving state", () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        currentProjectId="p1"
        currentName="Alpha"
        dirty={true}
        saving={false}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByTestId("project-current-name")).toHaveTextContent("Alpha");
    expect(screen.getByText("● unsaved")).toBeTruthy();
  });

  it("calls onOpen for a project", () => {
    const onOpen = vi.fn();
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        currentProjectId="p1"
        currentName="Alpha"
        dirty={false}
        saving={false}
        onOpen={onOpen}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("project-open-p2"));
    expect(onOpen).toHaveBeenCalledWith("p2");
  });

  it("marks the current project with aria-current", () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        currentProjectId="p1"
        currentName="Alpha"
        dirty={false}
        saving={false}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByTestId("project-open-p1").getAttribute("aria-current")).toBe("true");
    expect(screen.getByTestId("project-open-p2").getAttribute("aria-current")).toBeNull();
  });
});

describe("ProjectDialog", () => {
  it("create dialog requires a name", () => {
    const onSubmit = vi.fn();
    render(<ProjectDialog kind="create" onSubmit={onSubmit} onClose={vi.fn()} />);
    const ok = screen.getByTestId("dialog-ok") as HTMLButtonElement;
    expect(ok.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("dialog-name-input"), { target: { value: "New" } });
    expect((screen.getByTestId("dialog-ok") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("dialog-ok"));
    expect(onSubmit).toHaveBeenCalledWith("New");
  });

  it("delete dialog requires typing the exact name", () => {
    const onSubmit = vi.fn();
    render(<ProjectDialog kind="delete" projectName="Alpha" onSubmit={onSubmit} onClose={vi.fn()} />);
    const ok = screen.getByTestId("dialog-ok") as HTMLButtonElement;
    expect(ok.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("dialog-confirm-input"), { target: { value: "Alpha" } });
    expect((screen.getByTestId("dialog-ok") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("dialog-ok"));
    expect(onSubmit).toHaveBeenCalledWith("Alpha");
  });

  it("cancel closes the dialog without submitting", () => {
    const onClose = vi.fn();
    render(<ProjectDialog kind="create" onSubmit={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("dialog-cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
