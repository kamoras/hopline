import { normalizeName, type Place } from "@/domain/place";
import type { ModeInfo } from "@/domain/modes";
import type { RouteSummary } from "@/server/routes";
import { readableTextColor } from "@/lib/color";
import { LineBadge } from "./line-badge";

const MAX_RESULTS = 40;
/** A board with this few stations (a handful of airports) lists them all; a big one waits for a search. */
const BROWSE_ALL_UP_TO = 12;

/**
 * The home of a station-first board (metro, flights): riders think in stations, not individual trains, so
 * the list is a station finder rather than a feed of every train.
 */
export function StationList({
  places,
  query,
  vocab,
  routes = [],
  onPick,
  onPickRoute,
}: {
  places: readonly Place[];
  query: string;
  vocab: ModeInfo;
  /** Routes matching the query, for a network people search by route number. */
  routes?: readonly RouteSummary[];
  onPick(id: string): void;
  onPickRoute?(route: RouteSummary): void;
}) {
  const q = normalizeName(query);
  const matches = q
    ? places
        .filter((p) => normalizeName(p.name).includes(q))
        .sort((a, b) => Number(!normalizeName(a.name).startsWith(q)) - Number(!normalizeName(b.name).startsWith(q)) || a.name.localeCompare(b.name))
        .slice(0, MAX_RESULTS)
    : !vocab.viewport && places.length <= BROWSE_ALL_UP_TO
      ? [...places].sort((a, b) => a.name.localeCompare(b.name))
      : [];

  if (!q && matches.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-line px-6 py-10 text-center">
        <p className="text-lg font-semibold tracking-tight">Find your {vocab.stopNoun}</p>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">{vocab.searchHint} Or tap a {vocab.stopNoun} on the map.</p>
      </div>
    );
  }
  if (matches.length === 0 && routes.length === 0) {
    return <p className="px-1 text-sm text-muted">No {vocab.stopNoun} matches “{query}”.</p>;
  }
  return (
    <>
      {routes.length > 0 && onPickRoute && (
        <section aria-label={`${vocab.lineNoun}s`} className="mb-3">
          <h2 className="mb-1 px-1 text-xs font-semibold tracking-wide text-muted uppercase">{vocab.lineNoun}s</h2>
          <ul className="space-y-1">
            {routes.map((r) => (
              <li key={r.route}>
                <button type="button" onClick={() => onPickRoute(r)} className="press flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2">
                  <LineBadge route={r.route} color={r.color} textColor={readableTextColor(r.color)} size={28} label={`${vocab.lineNoun} ${r.route}`} />
                  <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    Map <span aria-hidden>→</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {matches.length > 0 && (
        <ul className="space-y-1" aria-label={`${vocab.stopNoun}s`}>
          {matches.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p.id)} className="press flex w-full items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-surface-2">
                <span className="font-medium">{p.name}</span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  Arrivals <span aria-hidden>→</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
