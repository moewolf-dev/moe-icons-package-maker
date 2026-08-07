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
import type { MakerProjectDraft } from "../contracts/project";
import { MAKER_PROJECT_SCHEMA_VERSION } from "../contracts/project";

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
  licenseOther?: string;
}

export interface MakerSession {
  readonly catalog: IconCatalog;
  readonly index: CatalogIndex;
  readonly selectedIds: readonly string[];
  readonly assignments: MappingState;
  readonly previewUrls: ReadonlyMap<string, string>;
  readonly metadata: GroupMetadata;
  readonly validation: readonly ValidationIssue[];
  /** Validation issues keyed by icon id; independent per icon. */
  readonly validationByIcon: ReadonlyMap<string, readonly ValidationIssue[]>;
  readonly progress: ReturnType<typeof getMappingProgress>;
  readonly missing: readonly MappingIssue[];
  readonly dirty: boolean;
  readonly buildStatus: "idle" | "building" | "success" | "error" | "cancelled";
  readonly buildError: string | undefined;
  readonly buildResult: { checksum: string; createdAt: string; files: string[] } | undefined;
  readonly partialAcknowledged: boolean;
  readonly fallbackPolicy: "fallback" | "error";

  toggleSelect(id: string): void;
  setQuery(query: string): readonly IconDefinition[];
  assignFile(id: string, file: File): Promise<{ ok: boolean; errors: readonly string[] }>;
  removeAssignment(id: string): void;
  /** Remove the whole slot: assignment, selection, SVG cache, preview, validation. */
  removeSlot(id: string): void;
  setMetadata(patch: Partial<GroupMetadata>): void;
  setPartialAcknowledged(value: boolean): void;
  setFallbackPolicy(value: "fallback" | "error"): void;
  build(signal?: AbortSignal): Promise<void>;
  reset(): void;
  /** Serialize current session state (minus blobs) for local draft storage. */
  toDraft(): MakerProjectDraft;
  /** Restore session state from a stored draft; blobs are re-read by the caller. */
  restoreFromDraft(draft: MakerProjectDraft): void;
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
  const [previewUrls, setPreviewUrls] = useState<ReadonlyMap<string, string>>(new Map());
  const [metadata, setMetadataState] = useState<GroupMetadata>(EMPTY_METADATA);
  const [validationByIcon, setValidationByIcon] = useState<ReadonlyMap<string, readonly ValidationIssue[]>>(new Map());
  const [dirty, setDirty] = useState(false);
  const [buildStatus, setBuildStatus] = useState<MakerSession["buildStatus"]>("idle");
  const [buildError, setBuildError] = useState<string | undefined>(undefined);
  const [buildResult, setBuildResult] = useState<MakerSession["buildResult"]>(undefined);
  const [partialAcknowledged, setPartialAcknowledgedState] = useState(false);
  const [fallbackPolicy, setFallbackPolicyState] = useState<"fallback" | "error">("fallback");
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
      const read = await readSvgInput(await readFileBuffer(file), {
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
      ].map((issue) => ({ ...issue, iconId: id }));
      setValidationByIcon((prev) => {
        const next = new Map(prev);
        next.set(id, issues);
        return next;
      });
      svgCache.current.set(id, read.value);

      let baseState = assignments;
      if (!baseState.some((slot) => slot.icon.id === id)) {
        const created = createMappingState(catalog, [...selectedIds, id]);
        if (!created.ok) return { ok: false, errors: created.errors.map((e) => e.message) };
        // Preserve existing assignments when extending the selection: the fresh
        // slots are empty, so carry over prior assigned sources by id.
        const prior = new Map(
          assignments.map((slot) => [slot.icon.id, slot.assignedSource] as const),
        );
        baseState = created.value.map((slot) =>
          prior.has(slot.icon.id)
            ? { ...slot, assignedSource: prior.get(slot.icon.id) }
            : slot,
        );
        setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      }

      const result = assignSvg(baseState, id, read.value);
      if (!result.ok) return { ok: false, errors: result.errors.map((e) => e.message) };
      setAssignments(result.value);
      setPreviewUrls((prev) => {
        const next = new Map(prev);
        const previewUrl = typeof URL.createObjectURL === "function"
          ? URL.createObjectURL(file)
          : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(read.value.text)}`;
        next.set(id, previewUrl);
        return next;
      });
      setDirty(true);
      return { ok: true, errors: [] };
    },
    [assignments, catalog, selectedIds],
  );

  const removeAssignment = useCallback((id: string) => {
    setAssignments((prev) => {
      const result = unassignSvg(prev, id);
      return result.ok ? result.value : prev;
    });
    svgCache.current.delete(id);
    setPreviewUrls((prev) => {
      const next = new Map(prev);
      const url = next.get(id);
      if (url?.startsWith("blob:") && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(url);
      }
      next.delete(id);
      return next;
    });
    setValidationByIcon((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setDirty(true);
  }, []);

  const removeSlot = useCallback(
    (id: string) => {
      removeAssignment(id);
      setSelectedIds((prev) => {
        if (!prev.includes(id)) return prev;
        const next = prev.filter((x) => x !== id);
        const state = createMappingState(catalog, next);
        if (state.ok) {
          setAssignments(state.value);
          setDirty(true);
        }
        return next;
      });
    },
    [catalog, removeAssignment],
  );

  const setMetadata = useCallback((patch: Partial<GroupMetadata>) => {
    setMetadataState((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const build = useCallback(
    async (signal?: AbortSignal) => {
      setBuildStatus("building");
      setBuildError(undefined);
      setBuildResult(undefined);
      const issues = [
        ...Array.from(validationByIcon.values()).flat(),
        ...listMappingIssues(assignments),
      ];
      const sources: Record<string, string> = {};
      const sourceChecksums: Record<string, string> = {};
      for (const slot of assignments) {
        const svg = svgCache.current.get(slot.icon.id);
        if (svg) {
          sources[slot.icon.id] = svg.text;
          sourceChecksums[slot.icon.id] = await sha256Hex(svg.text);
        }
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
              { content, checksum: sourceChecksums[id] ?? "x".repeat(64) },
            ]),
          ),
          validationIssues: issues,
          createdAt: "2026-08-06T00:00:00.000Z",
        },
        { requireZeroErrors: true, allowWarnings: true },
      );

      if (signal?.aborted) {
        setBuildStatus("cancelled");
        return;
      }

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
        const result = await materializeBuild(plan.value, writer, {
          createdWith: "moe-icons-package-maker@0.1.0",
          author: {
            name: metadata.author || "anonymous",
            ...(metadata.email ? { email: metadata.email } : {}),
            ...(metadata.source ? { source: metadata.source } : {}),
            ...(metadata.license ? { license: metadata.license } : {}),
          },
        });
        if (signal?.aborted) {
          setBuildStatus("cancelled");
          return;
        }
        const checksum = await sha256Hex(JSON.stringify(result.files));
        setBuildResult({
          checksum,
          createdAt: plan.value.createdAt,
          files: Object.keys(result.files),
        });
        snapshot.current = JSON.stringify({ selectedIds, assignments, metadata });
        setBuildStatus("success");
        setDirty(false);
      } catch (error) {
        if (signal?.aborted) {
          setBuildStatus("cancelled");
          return;
        }
        setBuildStatus("error");
        setBuildError(String(error));
      }
    },
    [validationByIcon, assignments, metadata, selectedIds],
  );

  const setPartialAcknowledged = useCallback((value: boolean) => {
    setPartialAcknowledgedState(value);
  }, []);

  const setFallbackPolicy = useCallback((value: "fallback" | "error") => {
    setFallbackPolicyState(value);
  }, []);

  const reset = useCallback(() => {
    setSelectedIds([]);
    setAssignments([]);
    setPreviewUrls((prev) => {
      if (typeof URL.revokeObjectURL === "function") {
        for (const url of prev.values()) {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        }
      }
      return new Map();
    });
    setMetadataState(EMPTY_METADATA);
    setValidationByIcon(new Map());
    setDirty(false);
    setBuildStatus("idle");
    setBuildError(undefined);
    setBuildResult(undefined);
    setPartialAcknowledgedState(false);
    setFallbackPolicyState("fallback");
    svgCache.current.clear();
  }, []);

  const progress = getMappingProgress(assignments);
  const missing = listMappingIssues(assignments).filter(
    (issue) => issue.code === "MISSING_ICON",
  );
  const validation = Array.from(validationByIcon.values()).flat();

  const toDraft = useCallback((): MakerProjectDraft => {
    const now = new Date().toISOString();
    const mapping: Record<string, string> = {};
    const refs: { blobId: string; fileName: string; mimeType: string; size: number; sha256: string }[] = [];
    for (const slot of assignments) {
      const svg = svgCache.current.get(slot.icon.id);
      if (svg) {
        const blobId = `blob-${slot.icon.id}`;
        mapping[slot.icon.id] = blobId;
        refs.push({
          blobId,
          fileName: svg.name,
          mimeType: "image/svg+xml",
          size: svg.byteLength,
          sha256: "x".repeat(64),
        });
      }
    }
    return {
      metadata: {
        id: "",
        name: "",
        schemaVersion: MAKER_PROJECT_SCHEMA_VERSION,
        catalogSchemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      },
      selectedIds,
      groupMetadata: {
        groupId: metadata.groupId,
        displayName: metadata.displayName,
        styleId: metadata.styleId,
        author: metadata.author,
        email: metadata.email,
        source: metadata.source,
        license: metadata.license,
      },
      fallbackPolicy,
      mapping,
      blobRefs: refs,
    };
  }, [assignments, selectedIds, metadata, fallbackPolicy]);

  const restoreFromDraft = useCallback((draft: MakerProjectDraft): void => {
    setSelectedIds([...draft.selectedIds]);
    const created = createMappingState(catalog, draft.selectedIds);
    if (created.ok) {
      // mark assigned sources by mapping keys
      const next = created.value.map((slot) => {
        const blobId = draft.mapping[slot.icon.id];
        return blobId ? { ...slot, assignedSource: blobId } : slot;
      });
      setAssignments(next);
    } else {
      setAssignments([]);
    }
    setMetadataState({
      groupId: draft.groupMetadata.groupId,
      displayName: draft.groupMetadata.displayName,
      styleId: draft.groupMetadata.styleId,
      author: draft.groupMetadata.author,
      email: draft.groupMetadata.email,
      source: draft.groupMetadata.source,
      license: draft.groupMetadata.license,
    });
    setFallbackPolicyState(draft.fallbackPolicy);
    setPreviewUrls(new Map());
    setValidationByIcon(new Map());
    setBuildStatus("idle");
    setBuildError(undefined);
    setBuildResult(undefined);
    setPartialAcknowledgedState(false);
    setDirty(false);
    svgCache.current.clear();
  }, [catalog]);

  return {
    catalog,
    index,
    selectedIds,
    assignments,
    previewUrls,
    metadata,
    validation,
    validationByIcon,
    progress,
    missing,
    dirty,
    buildStatus,
    buildError,
    buildResult,
    partialAcknowledged,
    fallbackPolicy,
    toggleSelect,
    setQuery,
    assignFile,
    removeAssignment,
    removeSlot,
    setMetadata,
    setPartialAcknowledged,
    setFallbackPolicy,
    build,
    reset,
    toDraft,
    restoreFromDraft,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readFileBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("failed to read file"));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("file reader returned an unsupported result"));
    };
    reader.readAsArrayBuffer(file);
  });
}
