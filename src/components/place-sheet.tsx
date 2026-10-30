"use client";

import { useEffect } from "react";
import type { Place } from "@/domain/place";
import type { Region } from "@/domain/region";
import type { Trip } from "@/domain/trip";
import { MODES } from "@/domain/modes";
import { searchTrips } from "@/lib/search";
import { TripRow } from "./trip-row";

interface Props {
  place: Place;
  trips: readonly Trip[];
  places: readonly Place[];
  region: Region;
  onClose(): void;
  onOpenTrip(key: string): void;
  /** Start an A-to-B search from this place. */
  onPickRoute(from: Place, to: Place): void;
}

/** A station's next departures, plus a quick way to turn it into an A-to-B commute. */
export function PlaceSheet({ place, trips, places, region, onClose, onOpenTrip, onPickRoute }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const matches = searchTrips(trips, { query: place.name, operator: "all", delayedOnly: false }).slice(0, 12);
  const noun = MODES[place.mode].nounPlural;

  return (
    <div className="fixed inset-0 z-30 flex items-end lg:items-stretch lg:justify-end" role="dialog" aria-modal="true" aria-label={place.name}>
      <button type="button" className="absolute inset-0 bg-black/40 lg:bg-transparent" aria-label="Close" onClick={onClose} />
      <div className="sheet-in relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2xl lg:max-h-none lg:w-[420px] lg:rounded-none lg:rounded-l-3xl">
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <div className="text-sm text-muted">Next {noun} at</div>
            <h2 className="text-2xl font-bold tracking-tight">{place.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl text-muted hover:bg-surface-2">
            ×
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-2 pb-5">
          <label className="block px-3">
            <span className="text-xs font-semibold tracking-wide text-muted uppercase">Going to</span>
            <select
              defaultValue=""
              onChange={(e) => {
                const to = places.find((p) => p.id === e.target.value);
                if (to) onPickRoute(place, to);
              }}
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5"
            >
              <option value="">Any destination</option>
              {places
                .filter((p) => p.id !== place.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>

          {matches.length > 0 ? (
            <ul>
              {matches.map((m) => (
                <TripRow key={m.trip.id} match={m} region={region} onOpen={onOpenTrip} />
              ))}
            </ul>
          ) : (
            <p className="px-3 text-sm text-muted">No {noun} due here right now.</p>
          )}
        </div>
      </div>
    </div>
  );
}
