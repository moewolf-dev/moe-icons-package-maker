import { useEffect, useMemo, useState } from "react";
import type { IconDefinition } from "../../contracts/types";
import { IconAssignmentCard } from "./icon-assignment-card";

const ROW_HEIGHT = 184;
const OVERSCAN = 4;

/**
 * VirtualizedIconGrid renders 1,108 catalog entries without creating 1,108
 * simultaneous DOM nodes or object URLs. Only visible rows mount.
 */
export function VirtualizedIconGrid({
  icons,
  assignments,
  onChoose,
  onRemove,
  onRemoveSlot,
  referencePreview,
  focusIconId,
  onFocusConsumed,
}: {
  icons: readonly IconDefinition[];
  assignments: ReadonlyMap<string, { source: string | undefined; previewUrl?: string }>;
  onChoose: (id: string, file: File) => Promise<{ ok: boolean; errors: readonly string[] }>;
  onRemove: (id: string) => void;
  onRemoveSlot?: (id: string) => void;
  referencePreview?: ((iconId: string) => string | undefined) | undefined;
  focusIconId?: string;
  onFocusConsumed?: () => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  useEffect(() => {
    const measure = () => {
      const el = document.getElementById("virtualized-grid");
      if (el) setViewportHeight(el.clientHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Scroll the focused icon into view (including when it is not yet mounted).
  useEffect(() => {
    if (!focusIconId) return;
    const index = icons.findIndex((icon) => icon.id === focusIconId);
    if (index === -1) return;
    const target = index * ROW_HEIGHT;
    setScrollTop(Math.max(0, target - ROW_HEIGHT));
  }, [focusIconId, icons]);

  // Focus the card once it is mounted after scrolling.
  useEffect(() => {
    if (!focusIconId) return;
    const el = document.querySelector<HTMLElement>(`[data-testid="icon-card-${focusIconId}"]`);
    if (!el) return;
    const focusable = el.querySelector<HTMLElement>("button, input, [tabindex]");
    focusable?.focus();
    onFocusConsumed?.();
  }, [focusIconId, onFocusConsumed, scrollTop]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(
    icons.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
  );
  const visible = useMemo(() => icons.slice(start, end), [icons, start, end]);

  const totalHeight = icons.length * ROW_HEIGHT;

  return (
    <div
      id="virtualized-grid"
      data-testid="virtualized-grid"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      style={{ height: viewportHeight, overflowY: "auto", position: "relative" }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visible.map((icon, i) => {
          const absoluteIndex = start + i;
          return (
            <div
              key={icon.id}
              style={{
                position: "absolute",
                top: absoluteIndex * ROW_HEIGHT,
                height: ROW_HEIGHT,
                left: 0,
                right: 0,
              }}
            >
              <IconAssignmentCard
                icon={icon}
                assignment={assignments.get(icon.id)}
                referencePreview={referencePreview?.(icon.id)}
                onChoose={(file) => onChoose(icon.id, file)}
                onRemove={() => onRemove(icon.id)}
                {...(onRemoveSlot ? { onRemoveSlot: () => onRemoveSlot(icon.id) } : {})}
              />            </div>
          );
        })}
      </div>
    </div>
  );
}
