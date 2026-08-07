import { XMLParser } from "fast-xml-parser";

/**
 * Safe SVG ingestion. Untrusted SVG is never executed: parsing is done with a
 * non-executing XML parser (fast-xml-parser with processEntities disabled), and
 * a pattern pre-check rejects DTD/entities/scripts/event attributes/external
 * references before any parsing occurs (defense in depth).
 */

export interface SvgSource {
  /** Original file name, retained separately from canonical mapping. */
  readonly name: string;
  /** Decoded UTF-8 string content. */
  readonly text: string;
  /** Byte length of the raw input (before decode). */
  readonly byteLength: number;
}

export interface SvgReadLimits {
  /** Maximum accepted byte length before decoding. */
  readonly maxBytes: number;
  /** Accepted MIME types when a MIME value is supplied. Empty array allows any. */
  readonly allowedMimeTypes: readonly string[];
  /** Accepted file extensions. Empty array allows any. */
  readonly allowedExtensions: readonly string[];
}

export interface ValidationIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly path?: string;
  /** Canonical icon id this issue belongs to (set by the session layer). */
  readonly iconId?: string;
}

export type ParseResult =
  | { readonly ok: true; readonly value: ParsedSvg }
  | { readonly ok: false; readonly errors: ValidationIssue[] };

/** A minimal structured representation of the SVG tree. */
export interface SvgElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly SvgElement[];
  /** Concatenated text content of this element and descendants. */
  readonly text: string;
}

export interface ParsedSvg {
  readonly root: SvgElement;
  /** Raw normalized source string. */
  readonly source: string;
}

const DEFAULT_LIMITS: SvgReadLimits = {
  maxBytes: 2 * 1024 * 1024,
  allowedMimeTypes: ["image/svg+xml", "text/xml", "application/xml", ""],
  allowedExtensions: [".svg", ".xml"],
};

const RE_DANGEROUS = /<!DOCTYPE|<!(?:ENTITY|ATTLIST|ELEMENT)|<!\[CDATA\[|<script|foreignObject|\bon\w+\s*=|xlink:href|style\s*=\s*["']?[^"'>]*url\(/i;

const EVENT_ATTR_RE = /^on/i;

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^"'>])*)(\/?)\s*>/g;

/**
 * Lightweight tag-balance check to reject malformed XML that lenient parsers
 * tolerate (e.g. unmatched closing tags). Returns an issue or undefined.
 */
function checkTagBalance(source: string): ValidationIssue | undefined {
  const stack: string[] = [];
  let match: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(source)) !== null) {
    const [, name, , selfClose] = match;
    if (!name) continue;
    const raw = match[0];
    const isSelfClosing = selfClose === "/" || /\/\s*>$/.test(raw);
    if (isSelfClosing) continue;
    if (raw.startsWith("</")) {
      const expected = stack.pop();
      if (expected !== name) {
        return {
          code: "MALFORMED_XML",
          severity: "error",
          message: `mismatched closing tag </${name}> (expected </${expected ?? "?"}>)`,
        };
      }
    } else {
      stack.push(name);
    }
  }
  if (stack.length > 0) {
    return {
      code: "MALFORMED_XML",
      severity: "error",
      message: `unclosed element(s): ${stack.join(", ")}`,
    };
  }
  return undefined;
}

/**
 * Read and decode an SVG input with explicit limits. Enforces the byte limit
 * BEFORE decoding; rejects wrong MIME/extension; validates UTF-8.
 */
export function readSvgInput(
  input: ArrayBuffer | Uint8Array | string,
  limits: SvgReadLimits = DEFAULT_LIMITS,
  metadata?: { name?: string; type?: string },
): Promise<ResultSvgSource> {
  return Promise.resolve().then(() => readSvgInputSync(input, limits, metadata));
}

function readSvgInputSync(
  input: ArrayBuffer | Uint8Array | string,
  limits: SvgReadLimits,
  metadata?: { name?: string; type?: string },
): ResultSvgSource {
  const name = metadata?.name ?? "icon.svg";
  const mime = metadata?.type ?? "";

  const extOk =
    limits.allowedExtensions.length === 0 ||
    limits.allowedExtensions.some((ext) => name.toLowerCase().endsWith(ext.toLowerCase()));
  if (!extOk) {
    return {
      ok: false,
      errors: [{ code: "UNSUPPORTED_EXTENSION", severity: "error", message: `unsupported file extension "${name}"` }],
    };
  }

  if (mime && limits.allowedMimeTypes.length > 0 && !limits.allowedMimeTypes.includes(mime)) {
    return {
      ok: false,
      errors: [{ code: "UNSUPPORTED_MIME", severity: "error", message: `unsupported MIME type "${mime}"` }],
    };
  }

  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }

  if (bytes.byteLength > limits.maxBytes) {
    return {
      ok: false,
      errors: [{ code: "SVG_TOO_LARGE", severity: "error", message: `svg exceeds byte limit ${limits.maxBytes}` }],
    };
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return {
      ok: false,
      errors: [{ code: "INVALID_UTF8", severity: "error", message: "input is not valid UTF-8" }],
    };
  }

  return { ok: true, value: { name, text, byteLength: bytes.byteLength } };
}

type ResultSvgSource =
  | { readonly ok: true; readonly value: SvgSource }
  | { readonly ok: false; readonly errors: ValidationIssue[] };

function toElement(node: unknown, name: string): SvgElement {
  if (typeof node !== "object" || node === null) {
    return { name, attributes: {}, children: [], text: String(node ?? "") };
  }
  const record = node as Record<string, unknown>;
  const attributes: Record<string, string> = {};
  const children: SvgElement[] = [];
  let text = "";

  for (const [key, value] of Object.entries(record)) {
    if (key === "#text" || key === "#cdata") {
      text = String(value ?? "");
      continue;
    }
    if (key === "?xml" || key === "?XML") continue;
    if (key.startsWith("@_")) {
      attributes[key.slice(2)] = String(value);
    } else if (key.startsWith("#")) {
      // comments / cdata / instruction; ignore content
    } else {
      children.push(...toElements(value, key));
    }
  }

  return { name, attributes, children, text };
}

function toElements(value: unknown, name: string): SvgElement[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((v) => toElement(v, name));
  return [toElement(value, name)];
}

/**
 * Parse and validate an SVG source. Uses a non-executing parser; rejects one or
 * more of: DTD/entities, scripts, event attributes, external URLs/references,
 * foreignObject, and malformed XML. Returns issues rather than throwing.
 */
export function parseSvg(source: SvgSource): ParseResult {
  const errors: ValidationIssue[] = [];

  if (source.byteLength === 0 || source.text.trim().length === 0) {
    return {
      ok: false,
      errors: [{ code: "EMPTY_SVG", severity: "error", message: "svg content is empty" }],
    };
  }

  if (RE_DANGEROUS.test(source.text)) {
    return {
      ok: false,
      errors: [{ code: "FORBIDDEN_SVG_CONTENT", severity: "error", message: "svg contains forbidden constructs (DTD/entity/script/event handler/external reference)" }],
    };
  }

  const balanceIssue = checkTagBalance(source.text);
  if (balanceIssue) {
    return { ok: false, errors: [balanceIssue] };
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    commentPropName: "#comment",
    cdataPropName: "#cdata",
    trimValues: false,
  });

  let parsed: unknown;
  try {
    parsed = parser.parse(source.text);
  } catch {
    return {
      ok: false,
      errors: [{ code: "MALFORMED_XML", severity: "error", message: "malformed XML" }],
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      errors: [{ code: "NOT_OBJECT_ROOT", severity: "error", message: "root must be an SVG object" }],
    };
  }

  const svgNodes = (parsed as Record<string, unknown>).svg;
  if (svgNodes === undefined) {
    return {
      ok: false,
      errors: [{ code: "MISSING_SVG_ROOT", severity: "error", message: "root <svg> element is required" }],
    };
  }

  const roots = Array.isArray(svgNodes) ? svgNodes : [svgNodes];
  if (roots.length !== 1) {
    return {
      ok: false,
      errors: [{ code: "MULTIPLE_SVG_ROOTS", severity: "error", message: "exactly one <svg> root is allowed" }],
    };
  }

  const rootEl = toElement(roots[0], "svg");

  const traverse = (node: SvgElement, path: string): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    if (node.name === "script" || node.name === "foreignObject") {
      issues.push({
        code: "FORBIDDEN_ELEMENT",
        severity: "error",
        message: `<${node.name}> is not allowed`,
        path,
      });
    }
    for (const [attr, value] of Object.entries(node.attributes)) {
      if (EVENT_ATTR_RE.test(attr)) {
        issues.push({
          code: "FORBIDDEN_EVENT_ATTRIBUTE",
          severity: "error",
          message: `event attribute "${attr}" is not allowed`,
          path: `${path}@${attr}`,
        });
      }
      if (/^(href|src)$/.test(attr) && /^(https?:|data:)/i.test(value)) {
        issues.push({
          code: "FORBIDDEN_EXTERNAL_REFERENCE",
          severity: "error",
          message: `external reference in ${attr} is not allowed`,
          path: `${path}@${attr}`,
        });
      }
    }
    node.children.forEach((child, i) => {
      issues.push(...traverse(child, `${path}/${i}`));
    });
    return issues;
  };

  errors.push(...traverse(rootEl, "/svg"));

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: { root: rootEl, source: source.text } };
}
