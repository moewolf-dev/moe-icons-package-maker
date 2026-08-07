import { useMemo, useState } from "react";
import type { IconCatalog } from "../contracts/types";
import type { ProjectRepository } from "../contracts/project";
import { MemoryProjectRepository } from "../storage/memory-project-repository";
import { useMakerSession } from "./use-maker-session";
import { useImportSession } from "./use-import-session";
import { useProjectController } from "./use-project-controller";
import { CatalogFilters } from "./components/catalog-filters";
import { VirtualizedIconGrid } from "./components/virtualized-icon-grid";
import { GroupMetadataForm } from "./components/group-metadata-form";
import { BuildReviewPanel } from "./components/build-review-panel";
import { UnsavedChangesGuard } from "./components/unsaved-changes-guard";
import { BulkImportDropzone } from "./components/bulk-import-dropzone";
import { ImportConflictPanel } from "./components/import-conflict-panel";
import { ProjectSwitcher } from "./components/project-switcher";
import { ProjectDialog } from "./components/project-dialog";
import type { ReferencePreviewState } from "./reference-preview";
import {
  deriveIconSlotViewModels,
  filterByStatuses,
  type IconSlotStatus,
} from "./icon-view-model";

/**
 * MakerApp accepts injected catalog, adapters, and a project repository so the
 * website can import it directly. No iframe and no secret-bearing props.
 */
export function MakerApp({
  catalog,
  referencePreview,
  referenceAvailability = "available",
  projectRepository,
}: {
  catalog: IconCatalog;
  referencePreview?: (iconId: string) => string | undefined;
  referenceAvailability?: ReferencePreviewState;
  projectRepository?: ProjectRepository;
}) {
  const session = useMakerSession(catalog);
  const importSession = useImportSession(session);
  const projectController = useProjectController(projectRepository ?? new MemoryProjectRepository(), session);
  const [query, setQuery] = useState("");
  const [subgroup, setSubgroup] = useState<string | undefined>(undefined);
  const [statuses, setStatuses] = useState<readonly IconSlotStatus[]>([]);
  const [activeTab, setActiveTab] = useState<"catalog" | "metadata" | "review">("catalog");
  const [focusIconId, setFocusIconId] = useState<string | undefined>(undefined);

  const viewModels = useMemo(
    () => deriveIconSlotViewModels(catalog, session.assignments, session.validationByIcon),
    [catalog, session.assignments, session.validationByIcon],
  );

  const filtered = useMemo(() => {
    const results = session.setQuery(query);
    let models = viewModels.filter((vm) => results.includes(vm.icon));
    models = filterByStatuses(models, statuses);
    if (subgroup) models = models.filter((vm) => vm.icon.subgroupId === subgroup);
    return models.map((vm) => vm.icon);
  }, [query, subgroup, statuses, session, viewModels]);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, { source: string | undefined; previewUrl?: string }>();
    for (const slot of session.assignments) {
      const previewUrl = session.previewUrls.get(slot.icon.id);
      map.set(slot.icon.id, {
        source: slot.assignedSource,
        ...(previewUrl ? { previewUrl } : {}),
      });
    }
    return map;
  }, [session.assignments, session.previewUrls]);

  const reviewIssues = useMemo(() => {
    const items: { code: string; severity: string; message: string; iconId?: string }[] = [];
    for (const v of session.validation) {
      items.push({ code: v.code, severity: v.severity, message: v.message, ...(v.iconId ? { iconId: v.iconId } : {}) });
    }
    for (const m of session.missing) {
      items.push({ code: m.code, severity: m.severity, message: m.message, ...(m.iconId ? { iconId: m.iconId } : {}) });
    }
    return items;
  }, [session.validation, session.missing]);

  const goToIcon = (iconId: string) => {
    setQuery("");
    setSubgroup(undefined);
    setStatuses([]);
    setFocusIconId(iconId);
    setActiveTab("catalog");
  };

  return (
    <div className="maker-app" data-testid="maker-app">
      <UnsavedChangesGuard dirty={session.dirty} />
      <header>
        <div>
          <p className="eyebrow">Moe Icons · Local workspace</p>
          <h1>Icon Group Builder</h1>
          <p className="intro">Match your SVGs to canonical icon names, validate them, and export a style group.</p>
        </div>
        <nav role="tablist" aria-label="Builder steps">
          {(["catalog", "metadata", "review"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>

      {projectController.saveError && (
        <p className="project-save-error" role="alert" data-testid="project-save-error">
          Save error: {projectController.saveError}
        </p>
      )}

      <ProjectSwitcher
        projects={projectController.projects}
        currentProjectId={projectController.currentProjectId}
        currentName={projectController.currentName}
        dirty={projectController.dirty}
        saving={projectController.saving}
        onOpen={(id) => void projectController.openProject(id)}
        onCreate={() => projectController.openDialog("create")}
        onRename={(project) => projectController.openDialog("rename", project)}
        onDuplicate={(project) => projectController.openDialog("duplicate", project)}
        onDelete={(project) => projectController.openDialog("delete", project)}
      />

      {projectController.dialog !== "none" && (
        <ProjectDialog
          kind={projectController.dialog}
          {...(projectController.dialogProject?.name ? { projectName: projectController.dialogProject.name } : {})}
          onClose={() => projectController.closeDialog()}
          onSubmit={(name) => {
            switch (projectController.dialog) {
              case "create":
                void projectController.createProject(name);
                break;
              case "rename":
                if (projectController.dialogProject) {
                  void projectController.renameProject(projectController.dialogProject.id, name);
                }
                break;
              case "duplicate":
                if (projectController.dialogProject) {
                  void projectController.duplicateProject(projectController.dialogProject.id, name);
                }
                break;
              case "delete":
                if (projectController.dialogProject) {
                  void projectController.deleteProject(projectController.dialogProject.id);
                }
                break;
              case "open":
                if (projectController.dialogProject) {
                  void projectController.openProject(projectController.dialogProject.id);
                }
                break;
              default:
                projectController.closeDialog();
            }
          }}
        />
      )}

      {referenceAvailability === "missing" && (
        <p className="reference-notice" role="status" data-testid="reference-missing-notice">
          Official reference source is unavailable; uploads and validation still work.
        </p>
      )}

      {activeTab === "catalog" && (
        <>
          <div className="progress-strip" role="status" aria-live="polite">
            <span><strong>{filtered.length}</strong> shown</span>
            <span><strong>{session.progress.selected}</strong> selected</span>
            <span><strong>{session.progress.filled}</strong> filled</span>
          </div>
          <BulkImportDropzone
            onFiles={(files) => void importSession.scanFiles(files)}
            busy={importSession.state === "scanning" || importSession.state === "applying"}
          />
          {importSession.state === "conflicts" && (
            <ImportConflictPanel
              candidates={importSession.candidates}
              conflicts={importSession.conflicts}
              decisions={importSession.decisions}
              onResolve={(candidateId, iconId) => importSession.resolveConflict(candidateId, iconId)}
            />
          )}
          {importSession.error && (
            <p className="import-error" role="alert" data-testid="import-error">
              {importSession.error}
            </p>
          )}
          {(importSession.state === "ready" || importSession.state === "conflicts") && (
            <div className="import-apply-row">
              <span data-testid="import-total">
                {importSession.matches.length} matched of {importSession.totalCount} files
              </span>
              <button
                type="button"
                onClick={() => void importSession.apply()}
                data-testid="import-apply-button"
              >
                Apply matched icons
              </button>
              <button type="button" className="secondary" onClick={() => importSession.cancel()} data-testid="import-cancel-button">
                Cancel
              </button>
            </div>
          )}
          {importSession.state === "applying" && (
            <p role="status" data-testid="import-progress">
              Applied {importSession.appliedCount} of {importSession.matches.length}
            </p>
          )}
          {importSession.state === "success" && (
            <p role="status" data-testid="import-success">
              Import complete.
            </p>
          )}
          {importSession.state === "cancelled" && (
            <p role="status" data-testid="import-cancelled">Import cancelled.</p>
          )}
          <CatalogFilters
            catalog={catalog}
            onSearch={setQuery}
            subgroup={subgroup}
            onSubgroupChange={setSubgroup}
            statuses={statuses}
            onStatusesChange={(next) => setStatuses(next)}
          />
          <VirtualizedIconGrid
            icons={filtered}
            assignments={assignmentMap}
            referencePreview={referencePreview}
            {...(focusIconId ? { focusIconId } : {})}
            onFocusConsumed={() => setFocusIconId(undefined)}
            onChoose={async (id, file) => {
              const result = await session.assignFile(id, file);
              return { ok: result.ok, errors: result.errors };
            }}
            onRemove={(id) => session.removeAssignment(id)}
            onRemoveSlot={(id) => session.removeSlot(id)}
          />
        </>
      )}

      {activeTab === "metadata" && (
        <GroupMetadataForm
          metadata={session.metadata}
          onChange={(patch) => session.setMetadata(patch)}
          fallbackPolicy={session.fallbackPolicy}
          onFallbackPolicyChange={(value) => session.setFallbackPolicy(value)}
        />
      )}

      {activeTab === "review" && (
        <BuildReviewPanel
          counts={session.progress}
          issues={reviewIssues}
          buildStatus={session.buildStatus}
          buildError={session.buildError}
          buildResult={session.buildResult}
          partialAcknowledged={session.partialAcknowledged}
          onPartialAcknowledgedChange={(value) => session.setPartialAcknowledged(value)}
          onBuild={(signal) => session.build(signal)}
          onCancel={() => undefined}
          onGoToIcon={goToIcon}
        />
      )}
    </div>
  );
}
