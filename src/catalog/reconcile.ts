import { readFileSync, readdirSync } from "node:fs";
import { parseIconCatalog } from "./catalog.js";

/**
 * Reconcile the generated catalog against the official SVG source directory.
 * Exit code 1 with a report if any source file is unmapped or any catalog id
 * has no source file. Used as a CI check and in P1-02 closeout.
 */
export function reconcileCatalog(catalogPath: string, svgDir: string): {
  ok: boolean;
  report: string[];
} {
  const report: string[] = [];
  const raw: unknown = JSON.parse(readFileSync(catalogPath, "utf8"));
  const parsed = parseIconCatalog(raw);
  if (!parsed.ok) {
    return { ok: false, report: parsed.errors.map((e) => `catalog error: ${e.message}`) };
  }

  const files = readdirSync(svgDir)
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.replace(/\.svg$/i, ""))
    .sort((a, b) => a.localeCompare(b, "en"));
  const catalogIds = new Set(parsed.value.icons.map((i) => i.id));

  const unmapped = files.filter((f) => !catalogIds.has(f));
  const orphaned = parsed.value.icons.filter((i) => !files.includes(i.id));
  const dupIds =
    parsed.value.icons.length !== new Set(parsed.value.icons.map((i) => i.id)).size;

  report.push(`svg source files: ${files.length}`);
  report.push(`catalog icons: ${parsed.value.icons.length}`);
  report.push(`unmapped source files: ${unmapped.length}`);
  for (const f of unmapped) report.push(`  UNMAPPED: ${f}`);
  report.push(`catalog ids without source: ${orphaned.length}`);
  for (const i of orphaned) report.push(`  ORPHANED: ${i.id}`);
  report.push(`duplicate catalog ids: ${dupIds}`);

  return {
    ok: unmapped.length === 0 && orphaned.length === 0 && !dupIds,
    report,
  };
}

const catalogArg = process.argv[2];
const svgArg = process.argv[3];
if (catalogArg && svgArg) {
  const result = reconcileCatalog(catalogArg, svgArg);
  for (const line of result.report) console.log(line);
  if (!result.ok) process.exit(1);
}
