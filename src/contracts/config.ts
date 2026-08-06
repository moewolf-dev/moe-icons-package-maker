/**
 * moeicons.config.ts v1 schema.
 *
 * Decides D-06 (missing-icon policy), D-07 (package identity), D-08 (Tailwind
 * meaning), and D-09 (Vue equivalent) at the schema level:
 * - D-08: framework-neutral icons accept `class`/`className`; no third framework.
 * - D-09: Vue uses provide/inject with a reactive theme ref.
 * - D-06: missing-icon policy is `fallback` (deterministic) or `error`.
 */

export const MOEICONS_CONFIG_SCHEMA_VERSION = 1;

/** How to behave when an icon requested at runtime is missing from the group. */
export type MissingIconPolicy = "fallback" | "error";

/** Defaults applied to rendered icons within a theme. */
export interface ThemeDefaults {
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly className?: string;
}

/** A theme maps to one or more style IDs. */
export interface ThemeConfig {
  readonly styles: readonly string[];
  readonly defaultSize?: number;
  readonly strokeWidth?: number;
  readonly className?: string;
}

/** Supported component output frameworks. */
export type Framework = "react" | "vue";

/** The v1 user-facing configuration contract. */
export interface MoeiconsConfig {
  readonly schemaVersion: number;
  readonly framework: Framework;
  /** Canonical output directory for generated code, e.g. `src/moeicons`. */
  readonly outputDir: string;
  /** Default user-facing theme ID. */
  readonly defaultTheme: string;
  /** Theme ID -> theme config. */
  readonly themes: Readonly<Record<string, ThemeConfig>>;
  /** Requested icon IDs. */
  readonly icons: readonly string[];
  readonly missingIconPolicy?: MissingIconPolicy;
}

export interface ConfigIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly path?: string;
}

export type ConfigResult =
  | { readonly ok: true; readonly value: MoeiconsConfig }
  | { readonly ok: false; readonly errors: ConfigIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const RE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Runtime-validate an unknown value (e.g. the default export of a user
 * `moeicons.config.ts`) as a v1 config. Unknown fields are ignored with a
 * warning; unknown future major versions are rejected.
 */
export function parseMoeiconsConfig(input: unknown): ConfigResult {
  const errors: ConfigIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [{ code: "NOT_OBJECT", severity: "error", message: "config must be an object" }],
    };
  }

  if (typeof input.schemaVersion !== "number") {
    errors.push({ code: "MISSING_SCHEMA_VERSION", severity: "error", message: "schemaVersion required" });
  } else if (input.schemaVersion !== MOEICONS_CONFIG_SCHEMA_VERSION) {
    errors.push({
      code: "UNSUPPORTED_SCHEMA_VERSION",
      severity: "error",
      message: `unsupported schema version ${String(input.schemaVersion)}`,
    });
  }

  if (input.framework !== "react" && input.framework !== "vue") {
    errors.push({ code: "INVALID_FRAMEWORK", severity: "error", message: "framework must be 'react' or 'vue'" });
  }

  if (typeof input.outputDir !== "string" || input.outputDir.trim().length === 0) {
    errors.push({ code: "INVALID_OUTPUT_DIR", severity: "error", message: "outputDir required" });
  }

  if (typeof input.defaultTheme !== "string" || input.defaultTheme.length === 0) {
    errors.push({ code: "INVALID_DEFAULT_THEME", severity: "error", message: "defaultTheme required" });
  }

  if (!isRecord(input.themes)) {
    errors.push({ code: "MISSING_THEMES", severity: "error", message: "themes required" });
  } else if (typeof input.defaultTheme === "string" && !(input.defaultTheme in input.themes)) {
    errors.push({
      code: "DEFAULT_THEME_UNKNOWN",
      severity: "error",
      message: `defaultTheme "${input.defaultTheme}" not present in themes`,
    });
  } else {
    for (const [themeId, theme] of Object.entries(input.themes)) {
      if (!isRecord(theme)) {
        errors.push({ code: "INVALID_THEME", severity: "error", message: `themes.${themeId} must be object` });
        continue;
      }
      if (!Array.isArray(theme.styles) || theme.styles.some((s) => typeof s !== "string")) {
        errors.push({ code: "INVALID_THEME_STYLES", severity: "error", message: `themes.${themeId}.styles must be string[]` });
      }
    }
  }

  if (!Array.isArray(input.icons) || input.icons.some((i) => typeof i !== "string" || !RE_ID.test(i))) {
    errors.push({ code: "INVALID_ICONS", severity: "error", message: "icons must be a kebab-case string array" });
  }

  if (input.missingIconPolicy !== undefined) {
    if (input.missingIconPolicy !== "fallback" && input.missingIconPolicy !== "error") {
      errors.push({ code: "INVALID_MISSING_POLICY", severity: "error", message: "missingIconPolicy must be 'fallback' or 'error'" });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      schemaVersion: input.schemaVersion as number,
      framework: input.framework as Framework,
      outputDir: String(input.outputDir),
      defaultTheme: String(input.defaultTheme),
      themes: input.themes as MoeiconsConfig["themes"],
      icons: [...(input.icons as string[])],
      ...(input.missingIconPolicy !== undefined
        ? { missingIconPolicy: input.missingIconPolicy as MissingIconPolicy }
        : {}),
    },
  };
}
