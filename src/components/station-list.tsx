import { normalizeName, type Place } from "@/domain/place";
import type { ModeInfo } from "@/domain/modes";

const MAX_RESULTS = 40;
/** A board with this few stations (a handful of airports) lists them all; a big one waits for a search. */
const BROWSE_ALL_UP_TO = 12;

/**
 * The home of a station-first board (the subway): riders think in stations, not individual trains, so
 * the list is a station finder rather than a feed of every train.
 */
export function StationList({ places, query, vocab, onPick }: { places: readonly Place[]; query: string; vocab: ModeInfo; onPick(id: string): void }) {
  const q = normalizeName(query);
  const matches = q
    ? places
        .filter((p) => normalizeName(p.name).includes(q))
        .sort((a, b) => Number(!normalizeName(a.name).startsWith(q)) - Number(!normalizeName(b.name).startsWith(q)) || a.name.localeCompare(b.name))
        .slice(0, MAX_RESULTS)
    : places.length <= BROWSE_ALL_UP_TO
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
  if (matches.length === 0) {
    return <p className="px-1 text-sm text-muted">No {vocab.stopNoun} matches “{query}”.</p>;
  }
  return (
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
  );
}
