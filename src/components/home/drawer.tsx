"use client";

import { useEffect, type ReactNode } from "react";

/**
 * The panel that slides over the map with what a person asked about: search results, a vehicle, a station. It does not
 * block the map (no backdrop): the map stays alive behind it, and the camera makes room for it. A bottom sheet on a
 * phone, a side panel on a wide screen.
 */
export function Drawer({ label, onClose, children }: { label: string; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      aria-label={label}
      className="sheet-in absolute inset-x-0 bottom-0 z-20 flex max-h-[52dvh] flex-col rounded-t-3xl border border-line bg-surface shadow-lift lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[400px] lg:rounded-none lg:rounded-l-3xl lg:border-y-0 lg:border-r-0"
    >
      <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-10 grid h-9 w-9 place-items-center rounded-full text-xl text-muted hover:bg-surface-2">
        ×
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 pt-4 pr-14">{children}</div>
    </aside>
  );
}

/** How much of the map a drawer covers, so the camera can keep its subject in the part that is left. */
export function drawerPadding(open: boolean, wide: boolean, viewportHeight: number) {
  if (!open) return { top: 0, right: 0, bottom: 0, left: 0 };
  return wide ? { top: 0, right: 400, bottom: 0, left: 0 } : { top: 0, right: 0, bottom: Math.round(viewportHeight * 0.5), left: 0 };
}
