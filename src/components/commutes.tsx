import type { Region } from "@/domain/region";
import type { Trip } from "@/domain/trip";
import { routeKey, searchTrips, type Route } from "@/lib/search";
import { TripRow } from "./trip-row";

interface Props {
  commutes: readonly Route[];
  trips: readonly Trip[];
  region: Region;
  onOpenTrip(key: string): void;
  onOpenRoute(route: Route): void;
  onRemove(route: Route): void;
}

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Saved A-to-B routes with the next few departures each: the zero-click answer for daily riders. */
export function Commutes({ commutes, trips, region, onOpenTrip, onOpenRoute, onRemove }: Props) {
  if (commutes.length === 0) return null;
  return (
    <section aria-label="My commutes" className="mb-5 space-y-3">
      <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">⇄ My commutes</h2>
      {commutes.map((c) => {
        const matches = searchTrips(trips, { query: routeKey(c), operator: "all", delayedOnly: false }).slice(0, 3);
        return (
          <div key={routeKey(c)} className="rounded-2xl border border-line bg-surface p-2">
            <div className="flex items-center justify-between px-3 pt-1">
              <button type="button" onClick={() => onOpenRoute(c)} className="font-semibold hover:text-accent">
                {title(c.from)} → {title(c.to)}
              </button>
              <button type="button" onClick={() => onRemove(c)} aria-label={`Remove commute ${c.from} to ${c.to}`} className="rounded-full px-2 text-muted hover:bg-surface-2">
                ×
              </button>
            </div>
            {matches.length > 0 ? (
              <ul className="mt-1">
                {matches.map((m) => (
                  <TripRow key={m.trip.id} match={m} region={region} onOpen={onOpenTrip} />
                ))}
              </ul>
            ) : (
              <p className="px-3 py-3 text-sm text-muted">Nothing running on this route right now.</p>
            )}
          </div>
        );
      })}
    </section>
  );
}
