"use client";

import type { ReactNode, Ref } from "react";
import type { Region } from "@/domain/region";
import type { Trip } from "@/domain/trip";
import { isDelayed } from "@/domain/delay";
import { MODES } from "@/domain/modes";
import { StatusPill } from "./status-pill";
import { formatAgo } from "@/lib/format";
import { StopTimeline } from "./stop-timeline";
import { destinationPhrase, OperatorLine } from "./trip-parts";

const REASON_SOURCE = {
  "operator-reported": "Reported by the railroad",
  inferred: "Worked out from stop times",
} as const;

/** Everything about one trip below its header: status, why it is late, pin, and the stops. Used by the vehicle drawer. */
export function TripDetailBody({
  trip,
  region,
  now,
  pinned,
  onTogglePin,
  extra,
}: {
  trip: Trip;
  region: Region;
  now: number;
  pinned: boolean;
  onTogglePin(): void;
  /** More about the route this trip is on (alerts), placed above the stops. */
  extra?: ReactNode;
}) {
  const mode = MODES[trip.mode];
  const late = isDelayed(trip);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {mode.reportsDelay && <StatusPill status={trip.delayStatus} minutes={trip.delayMinutes} size="lg" />}
        {trip.position && (
          <span className="text-sm text-muted">
            {trip.position.source === "reported" ? "Live GPS" : "Estimated from schedule"}
            {trip.position.source === "reported" ? ` · updated ${formatAgo(trip.updatedAt, now)}` : ""}
            {trip.position.altitudeFt ? ` · ${trip.position.altitudeFt.toLocaleString("en-US")} ft` : ""}
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

      {extra}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onTogglePin}
          aria-pressed={pinned}
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${pinned ? "bg-accent text-on-accent" : "border border-line hover:bg-surface-2"}`}
        >
          {pinned ? `★ In My ${mode.nounPlural}` : `☆ Add to My ${mode.nounPlural}`}
        </button>
      </div>

      <StopTimeline stops={trip.stops} routeColor={trip.routeColor} region={region} platformNoun={mode.platformNoun} now={now} />
    </div>
  );
}

/** Who runs it, its number and where it is going. */
export function TripHeader({ trip, headingRef }: { trip: Trip; headingRef?: Ref<HTMLHeadingElement> }) {
  return (
    <div className="min-w-0">
      <OperatorLine trip={trip} />
      <h2 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="mt-1 text-2xl font-bold tracking-tight outline-none">
        <span className="tabular">{trip.number}</span> {destinationPhrase(trip)}
      </h2>
      {trip.origin && <p className="text-sm text-muted">from {trip.origin}</p>}
    </div>
  );
}
