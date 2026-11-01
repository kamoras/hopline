"use client";

import { useMemo } from "react";
import { MODES } from "@/domain/modes";
import { getRegion, NORTHEAST } from "@/domain/region";
import type { Trip } from "@/domain/trip";
import { useArrivals } from "@/hooks/use-arrivals";
import { groupArrivals, minutesUntil } from "@/lib/arrivals";
import { searchTrips } from "@/lib/search";
import { LineBadge } from "../line-badge";
import { destinationPhrase, PlatformTag, StopTime } from "../trip-parts";
import type { PlaceTarget } from "./model-home";

/** A station or airport: what is due there next, live. */
export function PlaceDrawer({ place, trips, now, onOpenTrip }: { place: PlaceTarget; trips: readonly Trip[]; now: number; onOpenTrip(id: string): void }) {
  const mode = MODES[place.mode];
  const stationsFirst = mode.browse === "stations";
  const { arrivals, isLoading, error } = useArrivals(place.mode, place.regionId, stationsFirst ? place.id : undefined);
  const groups = groupArrivals(arrivals, now).slice(0, 8);
  const region = getRegion(place.regionId) ?? NORTHEAST;
  // On a board that lists trains rather than stations, the trains calling here.
  const calling = useMemo(() => (stationsFirst ? [] : searchTrips(trips, { query: place.name, operator: "all", delayedOnly: false }).slice(0, 10)), [stationsFirst, trips, place.name]);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-muted">{stationsFirst ? `Next ${mode.nounPlural} at` : `${mode.label} at`}</div>
        <h2 tabIndex={-1} className="text-2xl font-bold tracking-tight outline-none">{place.name}</h2>
      </div>

      {stationsFirst ? (
        <ul className="space-y-2" aria-label={`Next ${mode.nounPlural}`}>
          {isLoading && groups.length === 0 && <li className="skeleton h-14 rounded-xl" aria-hidden />}
          {error && groups.length === 0 && <li className="text-sm text-muted">Couldn&apos;t load arrivals right now. We&apos;ll keep trying.</li>}
          {!isLoading && !error && groups.length === 0 && <li className="text-sm text-muted">No {mode.nounPlural} due in the next 45 minutes.</li>}
          {groups.map((g) => (
            <li key={g.key} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <LineBadge route={g.route} color={g.color} textColor={g.textColor} size={28} label={g.route} />
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 leading-snug font-medium">{mode.slug === "flights" ? "" : "to "}{g.headsign}</div>
                {g.warning && <div className="text-xs font-medium text-warn">{g.warning}</div>}
              </div>
              <div className="tabular text-right">
                <div className="text-lg leading-tight font-bold">{minutesUntil(g.times[0]!, now) === 0 ? "Due" : `${minutesUntil(g.times[0]!, now)} min`}</div>
                {g.times.length > 1 && <div className="text-xs text-muted">then {g.times.slice(1, 4).map((t) => minutesUntil(t, now)).join(", ")}</div>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2" aria-label={`${mode.nounPlural} calling here`}>
          {calling.length === 0 && <li className="text-sm text-muted">No {mode.nounPlural} due here right now.</li>}
          {calling.map(({ trip, stop }) => (
            <li key={trip.id}>
              <button type="button" onClick={() => onOpenTrip(trip.id)} className="press flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:bg-surface-2">
                <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: trip.routeColor }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="tabular font-semibold">{trip.number}</span> <span className="text-muted">{destinationPhrase(trip)}</span>
                </span>
                {stop && (
                  <span className="tabular text-right text-sm">
                    <StopTime stop={stop} region={region} /> <PlatformTag stop={stop} noun={mode.platformNoun} />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
