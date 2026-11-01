"use client";

import { MODES } from "@/domain/modes";
import type { BoardLink } from "@/domain/board";
import type { Trip } from "@/domain/trip";
import { readableTextColor } from "@/lib/color";
import type { RouteSummary } from "@/server/routes";
import { LineBadge } from "../line-badge";
import { destinationPhrase } from "../trip-parts";

/** One route of a big network: its whole track is on the map, and here are the vehicles running on it now. */
export function RouteDrawer({ board, route, trips, onOpenTrip }: { board: BoardLink; route: RouteSummary; trips: readonly Trip[]; onOpenTrip(id: string): void }) {
  const mode = MODES[board.mode];
  const running = trips.filter((t) => t.mode === board.mode && t.number.toLowerCase() === route.route.toLowerCase());
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <LineBadge route={route.route} color={route.color} textColor={readableTextColor(route.color)} size={40} label={`${mode.lineNoun} ${route.route}`} />
        <div className="min-w-0">
          <div className="text-sm text-muted">
            {mode.label} · {board.regionName}
          </div>
          <h2 tabIndex={-1} className="text-xl leading-tight font-bold tracking-tight outline-none">
            {route.name}
          </h2>
        </div>
      </div>
      <p className="text-sm text-muted">The whole {mode.lineNoun} is on the map.</p>
      <section aria-label={`${mode.nounPlural} on this ${mode.lineNoun}`}>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
          Running now{running.length ? ` · ${running.length}` : ""}
        </h3>
        {running.length === 0 && <p className="text-sm text-muted">No {mode.nounPlural} are reporting on this {mode.lineNoun} right now.</p>}
        <ul className="space-y-2">
          {running.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onOpenTrip(t.id)} className="press flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="tabular font-semibold">{t.number}</span> <span className="text-muted">{destinationPhrase(t)}</span>
                </span>
                {t.nextStop && <span className="shrink-0 truncate text-xs text-muted">next {t.nextStop.name}</span>}
                <span aria-hidden className="text-muted">›</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
