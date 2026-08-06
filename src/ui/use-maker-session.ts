import { useCallback, useMemo, useRef, useState } from "react";
import type { IconCatalog, IconDefinition, CatalogIndex } from "../contracts/types";
import { indexIconCatalog, searchIcons } from "../catalog/catalog";
import { parseSvg, readSvgInput, type SvgSource, type ValidationIssue } from "../svg/parse";
import { validateSvgStructure, validateSvgGeometry } from "../svg/validate";
import {
  createMappingState,
  assignSvg,
  unassignSvg,
  getMappingProgress,
  listMappingIssues,
  type MappingState,
  type MappingIssue,
} from "../mapping/mapping";
import { planBuild } from "../build/plan";
import { materializeBuild } from "../build/materialize";

/**
 * useMakerSession is the sole owner of catalog, selected IDs, assignments,
 * metadata, validation results, dirty state, and build status. UI cards must
 * not keep an independent authoritative copy.
 */

export interface GroupMetadata {
  groupId: string;
  displayName: string;
  styleId: string;
  author: string;
  email: string;
  source: string;
  license: string;
}

export interface MakerSession {
  readonly catalog: IconCatalog;
  readonly index: CatalogIndex;
  readonly selectedIds: readonly string[];
  readonly assignments: MappingState;
  readonly metadata: GroupMetadata;
  readonly validation: readonly ValidationIssue[];
  readonly progress: ReturnType<typeof getMappingProgress>;
  readonly missing: readonly MappingIssue[];
  readonly dirty: boolean;
  readonly buildStatus: "idle" | "building" | "success" | "error";
  readonly buildError: string | undefined;

  toggleSelect(id: string): void;
  setQuery(query: string): readonly IconDefinition[];
  assignFile(id: string, file: File): Promise<{ ok: boolean; errors: readonly string[] }>;
  removeAssignment(id: string): void;
  setMetadata(patch: Partial<GroupMetadata>): void;
  build(): Promise<void>;
  reset(): void;
}

const EMPTY_METADATA: GroupMetadata = {
  groupId: "",
  displayName: "",
  styleId: "outline",
  author: "",
  email: "",
  source: "",
  license: "",
};

export function useMakerSession(catalog: IconCatalog): MakerSession {
  const index = useMemo(() => indexIconCatalog(catalog), [catalog]);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [assignments, setAssignments] = useState<MappingState>([]);
  const [metadata, setMetadataState] = useState<GroupMetadata>(EMPTY_METADATA);
  const [validation, setValidation] = useState<readonly ValidationIssue[]>([]);
  const [dirty, setDirty] = useState(false);
  const [buildStatus, setBuildStatus] = useState<MakerSession["buildStatus"]>("idle");
  const [buildError, setBuildError] = useState<string | undefined>(undefined);
  const svgCache = useRef(new Map<string, SvgSource>());
  const snapshot = useRef<string>("");

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const state = createMappingState(catalog, next);
      if (state.ok) {
        setAssignments(state.value);
        setDirty(true);
      }
      return next;
    });
  }, [catalog]);

  const setQuery = useCallback(
    (query: string): readonly IconDefinition[] => searchIcons(index, query),
    [index],
  );

  const assignFile = useCallback(
    async (id: string, file: File): Promise<{ ok: boolean; errors: readonly string[] }> => {
      const read = await readSvgInput(await file.arrayBuffer(), {
        maxBytes: 2 * 1024 * 1024,
        allowedMimeTypes: ["image/svg+xml", "text/xml", "application/xml", ""],
        allowedExtensions: [".svg", ".xml"],
      }, { name: file.name, type: file.type });
      if (!read.ok) return { ok: false, errors: read.errors.map((e) => e.message) };

      const parsed = parseSvg(read.value);
      if (!parsed.ok) return { ok: false, errors: parsed.errors.map((e) => e.message) };

      const issues = [
        ...validateSvgStructure(parsed.value),
        ...validateSvgGeometry(parsed.value),
      ];
      setValidation(issues);
      svgCache.current.set(id, read.value);

      const result = assignSvg(assignments, id, read.value);
      if (!result.ok) return { ok: false, errors: result.errors.map((e) => e.message) };
      setAssignments(result.value);
      setDirty(true);
      return { ok: true, errors: [] };
    },
    [assignments],
  );

  const removeAssignment = useCallback((id: string) => {
    setAssignments((prev) => {
      const result = unassignSvg(prev, id);
      return result.ok ? result.value : prev;
    });
    svgCache.current.delete(id);
    setDirty(true);
  }, []);

  const setMetadata = useCallback((patch: Partial<GroupMetadata>) => {
    setMetadataState((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const build = useCallback(async () => {
    setBuildStatus("building");
    setBuildError(undefined);
    const issues = [...validation, ...listMappingIssues(assignments)];
    const sources: Record<string, string> = {};
    for (const slot of assignments) {
      const svg = svgCache.current.get(slot.icon.id);
      if (svg) sources[slot.icon.id] = svg.text;
    }

    const plan = planBuild(
      {
        groupId: metadata.groupId || "untitled-group",
        displayName: metadata.displayName || metadata.groupId || "Untitled",
        styleId: metadata.styleId || "outline",
        state: assignments,
        svgBySource: new Map(
          Object.entries(sources).map(([id, content]) => [
            id,
            { content, checksum: "x".repeat(64) },
          ]),
        ),
        validationIssues: issues,
        createdAt: "2026-08-06T00:00:00.000Z",
      },
      { requireZeroErrors: true, allowWarnings: true },
    );

    if (!plan.ok) {
      setBuildStatus("error");
      setBuildError(plan.errors.map((e) => e.message).join("; "));
      return;
    }

    const staging: Record<string, string> = {};
    const writer = {
      writeFile: (rel: string, content: string | Uint8Array) => {
        staging[rel] = typeof content === "string" ? content : new TextDecoder().decode(content);
        return Promise.resolve();
      },
      commit: () => Promise.resolve(),
      rollback: () => Promise.resolve(),
    };

    try {
      await materializeBuild(plan.value, writer, {
        createdWith: "moe-icons-package-maker@0.1.0",
        author: {
          name: metadata.author || "anonymous",
          ...(metadata.email ? { email: metadata.email } : {}),
          ...(metadata.source ? { source: metadata.source } : {}),
          ...(metadata.license ? { license: metadata.license } : {}),
        },
      });
      snapshot.current = JSON.stringify({ selectedIds, assignments, metadata });
      setBuildStatus("success");
      setDirty(false);
    } catch (error) {
      setBuildStatus("error");
      setBuildError(String(error));
    }
  }, [validation, assignments, metadata, selectedIds]);

  const reset = useCallback(() => {
    setSelectedIds([]);
    setAssignments([]);
    setMetadataState(EMPTY_METADATA);
    setValidation([]);
    setDirty(false);
    setBuildStatus("idle");
    setBuildError(undefined);
    svgCache.current.clear();
  }, []);

  const progress = getMappingProgress(assignments);
  const missing = listMappingIssues(assignments).filter(
    (issue) => issue.code === "MISSING_ICON",
  );

  return {
    catalog,
    index,
    selectedIds,
    assignments,
    metadata,
    validation,
    progress,
    missing,
    dirty,
    buildStatus,
    buildError,
    toggleSelect,
    setQuery,
    assignFile,
    removeAssignment,
    setMetadata,
    build,
    reset,
  };
}
