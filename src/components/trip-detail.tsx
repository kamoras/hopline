"use client";

import { useEffect } from "react";
import type { Region } from "@/domain/region";
import type { Trip } from "@/domain/trip";
import { isDelayed } from "@/domain/delay";
import { MODES } from "@/domain/modes";
import { StatusPill } from "./status-pill";
import { formatAgo } from "@/lib/format";
import { StopTimeline } from "./stop-timeline";
import { OperatorLine } from "./trip-parts";

interface Props {
  trip: Trip;
  region: Region;
  now: number;
  pinned: boolean;
  showMapButton: boolean;
  onClose(): void;
  onTogglePin(): void;
  onShowOnMap(): void;
}

const REASON_SOURCE = {
  "operator-reported": "Reported by the railroad",
  inferred: "Worked out from stop times",
} as const;

export function TripDetail({ trip, region, now, pinned, showMapButton, onClose, onTogglePin, onShowOnMap }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mode = MODES[trip.mode];
  const late = isDelayed(trip);

  return (
    <div className="fixed inset-0 z-30 flex items-end lg:items-stretch lg:justify-end" role="dialog" aria-modal="true" aria-label={`${mode.numberLabel} ${trip.number}`}>
      <button type="button" className="absolute inset-0 bg-black/40 lg:bg-transparent" aria-label="Close" onClick={onClose} />
      <div className="sheet-in relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2xl lg:max-h-none lg:w-[420px] lg:rounded-none lg:rounded-l-3xl">
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="min-w-0">
            <OperatorLine trip={trip} />
            <h2 className="mt-1 text-2xl font-bold tracking-tight">
              <span className="tabular">{trip.number}</span> to {trip.destination}
            </h2>
            {trip.origin && <p className="text-sm text-muted">from {trip.origin}</p>}
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl text-muted hover:bg-surface-2" aria-label="Close">
            ×
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 pb-5">
          <div className="flex flex-wrap items-center gap-3">
            {mode.reportsDelay && <StatusPill status={trip.delayStatus} minutes={trip.delayMinutes} size="lg" />}
            {trip.position && (
              <span className="text-sm text-muted">
                {trip.position.source === "reported" ? "Live GPS" : "Estimated from schedule"}
                {trip.position.source === "reported" ? ` · updated ${formatAgo(trip.updatedAt, now)}` : ""}
                {trip.position.speedMph ? ` · ${Math.round(trip.position.speedMph)} mph` : ""}
              </span>
            )}
          </div>

          {late && (
            <div className="rounded-2xl bg-surface-2 p-4">
              <div className="text-xs font-semibold tracking-wide text-muted uppercase">Why</div>
              {trip.delayReason ? (
                <>
                  <p className="mt-1 text-base font-medium">{trip.delayReason.text}</p>
                  <p className="mt-1 text-xs text-muted">{REASON_SOURCE[trip.delayReason.kind]}</p>
                </>
              ) : (
                <p className="mt-1 text-base text-muted">No reason has been published yet.</p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onTogglePin}
              aria-pressed={pinned}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${pinned ? "bg-accent text-on-accent" : "border border-line hover:bg-surface-2"}`}
            >
              {pinned ? `★ In My ${mode.nounPlural}` : `☆ Add to My ${mode.nounPlural}`}
            </button>
            {showMapButton && trip.position && (
              <button type="button" onClick={onShowOnMap} className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
                Show on map
              </button>
            )}
          </div>

          <StopTimeline stops={trip.stops} routeColor={trip.routeColor} region={region} platformNoun={mode.platformNoun} now={now} />
        </div>
      </div>
    </div>
  );
}
