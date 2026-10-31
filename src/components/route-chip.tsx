"use client";

import type { RouteSummary } from "@/server/routes";
import { readableTextColor } from "@/lib/color";
import { LineBadge } from "./line-badge";

/** The route being followed on a big network's map, with a way to go back to the whole area. */
export function RouteChip({ route, noun, onClear, className = "" }: { route: RouteSummary; noun: string; onClear(): void; className?: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pr-1.5 pl-2 text-sm ${className}`}>
      <LineBadge route={route.route} color={route.color} textColor={readableTextColor(route.color)} size={24} label={`${noun} ${route.route}`} />
      <span className="max-w-[16rem] truncate font-medium">{route.name}</span>
      <button type="button" onClick={onClear} aria-label={`Stop following ${noun} ${route.route}`} className="grid h-7 w-7 place-items-center rounded-full text-lg text-muted hover:bg-surface-2">
        ×
      </button>
    </div>
  );
}
