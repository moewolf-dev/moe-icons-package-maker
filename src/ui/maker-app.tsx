import { useMemo, useState } from "react";
import type { IconCatalog } from "../contracts/types";
import { useMakerSession } from "./use-maker-session";
import { CatalogFilters } from "./components/catalog-filters";
import { VirtualizedIconGrid } from "./components/virtualized-icon-grid";
import { GroupMetadataForm } from "./components/group-metadata-form";
import { BuildReviewPanel } from "./components/build-review-panel";
import { UnsavedChangesGuard } from "./components/unsaved-changes-guard";

/**
 * MakerApp accepts injected catalog and adapters so the website can import it
 * directly. No iframe and no secret-bearing props.
 */
export function MakerApp({
  catalog,
  referencePreview,
}: {
  catalog: IconCatalog;
  referencePreview?: (iconId: string) => string | undefined;
}) {
  const session = useMakerSession(catalog);
  const [query, setQuery] = useState("");
  const [subgroup, setSubgroup] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<"catalog" | "metadata" | "review">("catalog");

  const filtered = useMemo(() => {
    const results = session.setQuery(query);
    return subgroup ? results.filter((icon) => icon.subgroupId === subgroup) : results;
  }, [query, subgroup, session]);

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
    return [
      ...session.validation.map((v) => ({
        code: v.code,
        severity: v.severity,
        message: v.message,
      })),
      ...session.missing.map((m) => ({
        code: m.code,
        severity: m.severity,
        message: m.message,
      })),
    ];
  }, [session.validation, session.missing]);

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

      {activeTab === "catalog" && (
        <>
          <div className="progress-strip" role="status" aria-live="polite">
            <span><strong>{filtered.length}</strong> shown</span>
            <span><strong>{session.progress.selected}</strong> selected</span>
            <span><strong>{session.progress.filled}</strong> filled</span>
          </div>
          <CatalogFilters
            catalog={catalog}
            onSearch={setQuery}
            subgroup={subgroup}
            onSubgroupChange={setSubgroup}
          />
          <VirtualizedIconGrid
            icons={filtered}
            assignments={assignmentMap}
            referencePreview={referencePreview}
            onChoose={async (id, file) => {
              const result = await session.assignFile(id, file);
              return { ok: result.ok, errors: result.errors };
            }}
            onRemove={(id) => session.removeAssignment(id)}
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
        />
      )}
    </div>
  );
}
