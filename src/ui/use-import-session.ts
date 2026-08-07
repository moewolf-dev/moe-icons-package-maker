import { useCallback, useRef, useState } from "react";
import { unzipSync } from "fflate";
import type { MakerSession } from "./use-maker-session";
import type { ImportCandidate, ImportConflict, ImportMatch } from "../import/types";
import { discoverCandidates } from "../import/discover";
import { matchCandidatesExactly } from "../import/match";
import { detectImportConflicts } from "../import/conflicts";

/**
 * Bulk-import session. Owns the import state machine and reuses the single-file
 * SVG parse/validate path through the MakerSession so batch imports never
 * bypass validation. State transitions:
 *   idle -> scanning -> conflicts | ready -> applying -> success|error|cancelled
 */

export type ImportState =
  | "idle"
  | "scanning"
  | "conflicts"
  | "ready"
  | "applying"
  | "success"
  | "error"
  | "cancelled";

export interface ImportSession {
  readonly state: ImportState;
  readonly candidates: readonly ImportCandidate[];
  readonly matches: readonly ImportMatch[];
  readonly conflicts: readonly ImportConflict[];
  readonly decisions: Readonly<Record<string, string>>;
  readonly error: string | undefined;
  readonly appliedCount: number;
  readonly totalCount: number;
  scanFiles(files: readonly File[]): Promise<void>;
  resolveConflict(candidateId: string, iconId: string): void;
  apply(): Promise<void>;
  cancel(): void;
  reset(): void;
}

const MAX_ENTRIES = 500;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("failed to read file"));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(new Uint8Array(reader.result));
      else reject(new Error("file reader returned an unsupported result"));
    };
    reader.readAsArrayBuffer(file);
  });
}

/** Yield to the event loop so the UI stays responsive during large imports. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Wrap raw bytes into a File-like so session.assignFile can read them. */
function toFileLike(name: string, bytes: Uint8Array, mimeType: string): File {
  return new File([bytes as unknown as BlobPart], name, { type: mimeType });
}

export function useImportSession(session: MakerSession): ImportSession {
  const [state, setState] = useState<ImportState>("idle");
  const [candidates, setCandidates] = useState<readonly ImportCandidate[]>([]);
  const [matches, setMatches] = useState<readonly ImportMatch[]>([]);
  const [conflicts, setConflicts] = useState<readonly ImportConflict[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [appliedCount, setAppliedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [manualDecisions, setManualDecisions] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | undefined>(undefined);
  const payloadRef = useRef<Map<string, { file: File }>>(new Map());

  const scanFiles = useCallback(
    async (files: readonly File[]) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setState("scanning");
      setError(undefined);
      setManualDecisions({});
      const payloads = new Map<string, { file: File }>();

      try {
        const descriptors: { fileName: string; relativePath?: string; size: number; mimeType: string }[] = [];

        for (let i = 0; i < files.length; i += 1) {
          if (controller.signal.aborted) {
            setState("cancelled");
            return;
          }
          const file = files[i];
          if (!file) continue;
          if (i % 25 === 0) await yieldToEventLoop();
          const bytes = await readFileBytes(file);
          const isZip = file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
          if (isZip) {
            let entries: Record<string, Uint8Array>;
            try {
              entries = unzipSync(bytes);
            } catch {
              setError(`cannot decode ZIP: ${file.name}`);
              setState("error");
              return;
            }
            const keys = Object.keys(entries).sort();
            for (const rel of keys) {
              if (controller.signal.aborted) break;
              const content = entries[rel];
              if (!content) continue;
              const safeRel = rel.replace(/\\/g, "/");
              const fileName = safeRel.split("/").pop() ?? safeRel;
              const opaqueId = `candidate-${descriptors.length}`;
              descriptors.push({
                fileName,
                relativePath: safeRel,
                size: content.byteLength,
                mimeType: fileName.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "text/plain",
              });
              payloads.set(opaqueId, {
                file: toFileLike(fileName, content, fileName.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "text/plain"),
              });
            }
          } else {
            const opaqueId = `candidate-${descriptors.length}`;
            descriptors.push({
              fileName: file.name,
              size: bytes.byteLength,
              mimeType: file.type,
            });
            payloads.set(opaqueId, { file });
          }
          if (controller.signal.aborted) {
            setState("cancelled");
            return;
          }
        }

        const discovered = discoverCandidates(descriptors, {
          maxEntries: MAX_ENTRIES,
          maxTotalBytes: MAX_TOTAL_BYTES,
        });
        payloadRef.current = payloads;

        const exact = matchCandidatesExactly(discovered.candidates, session.index);
        setCandidates(discovered.candidates);
        setMatches(exact);
        setTotalCount(discovered.candidates.length);

        const detected = detectImportConflicts(discovered.candidates, exact, undefined, {
          maxFileBytes: MAX_FILE_BYTES,
          maxTotalBytes: MAX_TOTAL_BYTES,
          maxEntries: MAX_ENTRIES,
        });
        setConflicts(detected);

        // Any conflict (unmatched, duplicate, unsupported, ...) needs the panel;
        // a clean scan with exact matches only is ready to apply.
        if (detected.length > 0) {
          setState("conflicts");
        } else if (exact.length > 0) {
          setState("ready");
        } else {
          setState("conflicts");
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setState("error");
      }
    },
    [session.index],
  );

  const resolveConflict = useCallback((candidateId: string, iconId: string) => {
    setManualDecisions((prev) => {
      const next = { ...prev };
      if (iconId === "") delete next[candidateId];
      else next[candidateId] = iconId;
      return next;
    });
  }, []);

  const apply = useCallback(async () => {
    if (state !== "ready" && state !== "conflicts") return;
    setState("applying");
    setAppliedCount(0);

    // Effective matches = exact matches + manual decisions for unmatched candidates.
    const effective: ImportMatch[] = [...matches];
    const matchedIds = new Set(matches.map((m) => m.candidateId));
    for (const [candidateId, iconId] of Object.entries(manualDecisions)) {
      if (!matchedIds.has(candidateId) && session.index.byId.has(iconId)) {
        effective.push({ candidateId, iconId, reason: "manual" });
      }
    }

    const applicable = effective.filter((m) => session.index.byId.has(m.iconId));
    for (let i = 0; i < applicable.length; i += 1) {
      const m = applicable[i];
      if (!m) continue;
      if (abortRef.current?.signal.aborted) {
        setState("cancelled");
        return;
      }
      if (i % 10 === 0) await yieldToEventLoop();
      const payload = payloadRef.current.get(m.candidateId);
      if (!payload) continue;
      const result = await session.assignFile(m.iconId, payload.file);
      if (!result.ok && result.errors.length > 0) {
        setError(result.errors[0]);
      }
      setAppliedCount(i + 1);
    }

    if (abortRef.current?.signal.aborted) {
      setState("cancelled");
    } else {
      setState("success");
    }
  }, [state, matches, manualDecisions, session]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState("cancelled");
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState("idle");
    setCandidates([]);
    setMatches([]);
    setConflicts([]);
    setError(undefined);
    setAppliedCount(0);
    setTotalCount(0);
    setManualDecisions({});
    payloadRef.current = new Map();
  }, []);

  return {
    state,
    candidates,
    matches,
    conflicts,
    decisions: manualDecisions,
    error,
    appliedCount,
    totalCount,
    scanFiles,
    resolveConflict,
    apply,
    cancel,
    reset,
  };
}
