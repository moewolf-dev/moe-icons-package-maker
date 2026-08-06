import type { ParsedSvg, SvgElement, ValidationIssue } from "./parse";

/**
 * SVG quality validation. These checks are objective: structure, viewBox,
 * canvas size, drawable content, supported elements, ID uniqueness, embedded
 * raster data, and measurable geometry. Never claims subjective visual
 * correctness.
 */

export interface StructurePolicy {
  /** Supported drawable/support element names. */
  readonly allowedElements: ReadonlySet<string>;
  /** Supported attribute names. */
  readonly allowedAttributes: ReadonlySet<string>;
  /** Whether embedded raster data (e.g. <image>, <foreignObject>) is an error. */
  readonly rejectRaster: boolean;
}

export const DEFAULT_STRUCTURE_POLICY: StructurePolicy = {
  allowedElements: new Set([
    "svg",
    "g",
    "path",
    "circle",
    "rect",
    "line",
    "polyline",
    "polygon",
    "ellipse",
    "defs",
    "use",
    "symbol",
    "title",
    "desc",
    "metadata",
    "clipPath",
    "mask",
    "pattern",
    "linearGradient",
    "radialGradient",
    "stop",
    "style",
  ]),
  allowedAttributes: new Set([
    "id",
    "class",
    "style",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-miterlimit",
    "stroke-opacity",
    "fill-opacity",
    "fill-rule",
    "opacity",
    "transform",
    "d",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "width",
    "height",
    "points",
    "viewBox",
    "xmlns",
    "xmlns:xlink",
    "preserveAspectRatio",
    "clip-path",
    "mask",
    "href",
    "xlink:href",
    "gradientUnits",
    "gradientTransform",
    "spreadMethod",
    "offset",
    "stop-color",
    "stop-opacity",
    "patternUnits",
    "patternContentUnits",
  ]),
  rejectRaster: true,
};

const DRAWABLE = new Set([
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "use",
]);

/** Check root/viewBox, finite positive canvas, drawable content, elements, IDs. */
export function validateSvgStructure(
  parsed: ParsedSvg,
  policy: StructurePolicy = DEFAULT_STRUCTURE_POLICY,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const root = parsed.root;

  if (root.name !== "svg") {
    issues.push({
      code: "ROOT_NOT_SVG",
      severity: "error",
      message: "root element must be <svg>",
    });
  }

  const viewBox = root.attributes.viewBox;
  if (viewBox === undefined) {
    issues.push({
      code: "MISSING_VIEWBOX",
      severity: "warning",
      message: "svg has no viewBox attribute",
    });
  } else {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      issues.push({
        code: "INVALID_VIEWBOX",
        severity: "error",
        message: `viewBox "${viewBox}" must be four finite numbers`,
      });
    } else {
      const [, , w, h] = parts;
      if (!w || !h || w <= 0 || h <= 0) {
        issues.push({
          code: "NON_POSITIVE_CANVAS",
          severity: "error",
          message: "viewBox width/height must be finite and positive",
        });
      }
    }
  }

  let drawableCount = 0;
  const seenIds = new Set<string>();

  const walk = (node: SvgElement, path: string) => {
    if (node.name === "") return;
    if (!policy.allowedElements.has(node.name)) {
      issues.push({
        code: "UNSUPPORTED_ELEMENT",
        severity: "error",
        message: `<${node.name}> is not supported`,
        path,
      });
    }
    if (DRAWABLE.has(node.name)) drawableCount += 1;
    if (node.name === "image" || node.name === "foreignObject") {
      if (policy.rejectRaster) {
        issues.push({
          code: "RASTER_CONTENT",
          severity: "error",
          message: `<${node.name}> embedded raster/foreign content is not allowed`,
          path,
        });
      }
    }

    const id = node.attributes.id;
    if (id !== undefined) {
      if (seenIds.has(id)) {
        issues.push({
          code: "DUPLICATE_ID",
          severity: "error",
          message: `duplicate id "${id}"`,
          path,
        });
      }
      seenIds.add(id);
    }

    for (const attr of Object.keys(node.attributes)) {
      if (!policy.allowedAttributes.has(attr)) {
        issues.push({
          code: "UNSUPPORTED_ATTRIBUTE",
          severity: "warning",
          message: `attribute "${attr}" is not in the supported set`,
          path: `${path}@${attr}`,
        });
      }
    }

    node.children.forEach((child, i) => walk(child, `${path}/${i}`));
  };

  walk(root, "/svg");

  if (drawableCount === 0) {
    issues.push({
      code: "EMPTY_DRAWABLE_CONTENT",
      severity: "error",
      message: "svg has no drawable content",
    });
  }

  return issues;
}

/** Parse a viewBox string into {x, y, width, height} or undefined. */
export function parseViewBox(
  value: string | undefined,
): { x: number; y: number; width: number; height: number } | undefined {
  if (value === undefined) return undefined;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined;
  const x = parts[0] ?? 0;
  const y = parts[1] ?? 0;
  const width = parts[2] ?? 0;
  const height = parts[3] ?? 0;
  return { x, y, width, height };
}

/**
 * Report measurable out-of-view/clipping/aspect inconsistencies as warnings
 * unless policy makes them errors. If exact bounds cannot be calculated, emit
 * no false error.
 */
export function validateSvgGeometry(
  parsed: ParsedSvg,
  options: { aspectTolerance?: number; severity?: "error" | "warning" } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const tolerance = options.aspectTolerance ?? 0.5;
  const severity = options.severity ?? "warning";
  const root = parsed.root;
  const viewBox = parseViewBox(root.attributes.viewBox);
  if (!viewBox) return issues;

  const { width, height } = viewBox;

  // width/height attributes should be consistent with viewBox aspect
  const wAttr = Number(root.attributes.width);
  const hAttr = Number(root.attributes.height);
  if (Number.isFinite(wAttr) && Number.isFinite(hAttr) && wAttr > 0 && hAttr > 0) {
    const vbAspect = width / height;
    const attrAspect = wAttr / hAttr;
    const diff = Math.abs(vbAspect - attrAspect) / Math.max(vbAspect, 0.0001);
    if (diff > tolerance) {
      issues.push({
        code: "ASPECT_MISMATCH",
        severity,
        message: `width/height (${wAttr}x${hAttr}) aspect differs from viewBox (${width}x${height})`,
      });
    }
  }

  // geometry bounds check: find max coordinate extents from path d/points/rect
  const bounds = computeGeometryBounds(parsed.root);
  if (bounds) {
    const eps = 1;
    if (bounds.maxX > viewBox.x + viewBox.width + eps) {
      issues.push({
        code: "OUT_OF_VIEW_X",
        severity,
        message: `geometry extends beyond viewBox: maxX ${bounds.maxX.toFixed(2)} > ${(viewBox.x + viewBox.width).toFixed(2)}`,
      });
    }
    if (bounds.maxY > viewBox.y + viewBox.height + eps) {
      issues.push({
        code: "OUT_OF_VIEW_Y",
        severity,
        message: `geometry extends beyond viewBox: maxY ${bounds.maxY.toFixed(2)} > ${(viewBox.y + viewBox.height).toFixed(2)}`,
      });
    }
  }

  return issues;
}

interface Bounds {
  maxX: number;
  maxY: number;
}

/**
 * Best-effort geometry bounds from path/rect/circle/polygon data. If exact
 * bounds cannot be calculated, returns undefined (no false error).
 */
function computeGeometryBounds(root: SvgElement): Bounds | undefined {
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  const collect = (node: SvgElement) => {
    if (node.name === "path") {
      const d = node.attributes.d;
      if (d) {
        const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
        for (let i = 0; i < nums.length; i += 1) {
          const num = nums[i];
          if (num === undefined) continue;
          if (i % 2 === 0) {
            if (num > maxX) maxX = num;
          } else if (num > maxY) maxY = num;
        }
        if (nums.length >= 2) found = true;
      }
    } else if (node.name === "rect") {
      const x = Number(node.attributes.x ?? 0);
      const y = Number(node.attributes.y ?? 0);
      const w = Number(node.attributes.width);
      const h = Number(node.attributes.height);
      if (Number.isFinite(w) && Number.isFinite(h)) {
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
        found = true;
      }
    } else if (node.name === "circle") {
      const cx = Number(node.attributes.cx ?? 0);
      const cy = Number(node.attributes.cy ?? 0);
      const r = Number(node.attributes.r);
      if (Number.isFinite(r)) {
        maxX = Math.max(maxX, cx + r);
        maxY = Math.max(maxY, cy + r);
        found = true;
      }
    }
    node.children.forEach(collect);
  };

  collect(root);
  return found ? { maxX, maxY } : undefined;
}
