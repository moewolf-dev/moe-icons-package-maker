import { useEffect, useRef } from "react";

/**
 * UnsavedChangesGuard activates only when session state differs from the last
 * exported/imported snapshot. Blocks navigation/refresh with a browser prompt.
 */
export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  return null;
}
