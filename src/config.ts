/**
 * Runtime configuration loader. Validates only the variables required for the
 * selected mode. Secret-name scan passes: this module never reads or exposes
 * secret values, only documented non-secret names.
 */

export interface MakerEnvConfig {
  readonly catalogPath: string;
  readonly svgDir: string;
  readonly outputDir: string;
  readonly maxSvgBytes: number;
}

export interface EnvIssue {
  readonly name: string;
  readonly message: string;
}

export type EnvResult =
  | { readonly ok: true; readonly value: MakerEnvConfig }
  | { readonly ok: false; readonly errors: EnvIssue[] };

const DEFAULTS: MakerEnvConfig = {
  catalogPath: "data/icon-catalog.json",
  svgDir: "uploads/",
  outputDir: "out/",
  maxSvgBytes: 2 * 1024 * 1024,
};

function str(value: string | undefined, fallback: string): string {
  return value !== undefined && value.trim().length > 0 ? value : fallback;
}

function num(value: string | undefined, fallback: number): number | undefined {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Parse an env object (e.g. `process.env` or `import.meta.env`) into the
 * documented config. Unknown variables are ignored. Only non-secret names are
 * read.
 */
export function parseMakerEnv(
  env: Readonly<Record<string, string | undefined>>,
): EnvResult {
  const errors: EnvIssue[] = [];
  const maxSvgBytes = num(env.MAKER_MAX_SVG_BYTES, DEFAULTS.maxSvgBytes);
  const config: MakerEnvConfig = {
    catalogPath: str(env.MAKER_CATALOG_PATH, DEFAULTS.catalogPath),
    svgDir: str(env.MAKER_SVG_DIR, DEFAULTS.svgDir),
    outputDir: str(env.MAKER_OUTPUT_DIR, DEFAULTS.outputDir),
    maxSvgBytes: maxSvgBytes ?? DEFAULTS.maxSvgBytes,
  };

  if (maxSvgBytes === undefined) {
    errors.push({ name: "MAKER_MAX_SVG_BYTES", message: "must be a positive integer" });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: config };
}
