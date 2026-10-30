"use client";

import { memo } from "react";
import type { Region } from "@/domain/region";
import type { StopCall, Trip } from "@/domain/trip";
import { formatRelative } from "@/lib/format";
import { isDelayed } from "@/domain/delay";
import { MODES } from "@/domain/modes";
import { StatusPill } from "./status-pill";
import { OperatorLine, StopTime, stopTimes } from "./trip-parts";

interface Props {
  trip: Trip;
  /** When the user searched a station, the stop to feature. */
  stop?: StopCall;
  /** For A-to-B searches: where the rider gets off. */
  to?: StopCall;
  region: Region;
  now: number;
  pinned: boolean;
  onSelect(id: string): void;
  onTogglePin(trip: Trip): void;
}

function TripCardImpl({ trip, stop, to, region, now, pinned, onSelect, onTogglePin }: Props) {
  const mode = MODES[trip.mode];
  const focus = stop ?? trip.nextStop;
  const late = isDelayed(trip);
  const when = focus && stopTimes(focus).actual;

  return (
    <li className="card-cv">
      <div className="group relative rounded-2xl border border-line bg-surface shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:border-accent/50">
        <button
          type="button"
          onClick={() => onSelect(trip.id)}
          className="flex w-full flex-col gap-2.5 rounded-2xl p-4 text-left"
          aria-label={`${mode.numberLabel} ${trip.number} to ${trip.destination}, ${trip.routeName}`}
        >
          <div className="flex items-center justify-between gap-3">
            <OperatorLine trip={trip} />
            {mode.reportsDelay && <StatusPill status={trip.delayStatus} minutes={trip.delayMinutes} />}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="tabular text-2xl font-bold tracking-tight">{trip.number}</span>
            <span className="text-lg leading-snug font-medium">to {trip.destination}</span>
          </div>

          {focus && trip.state !== "canceled" && (
            <div className="tabular flex flex-wrap items-baseline gap-x-2 pr-9 text-[15px]">
              <span className="text-muted">{stop ? "From" : trip.state === "scheduled" ? "Departs" : "Next"}</span>
              <span className="font-semibold">{focus.name}</span>
              <span className="font-semibold">
                <StopTime stop={focus} region={region} emphasize={false} />
              </span>
              {to && (
                <span className="font-semibold">
                  → {to.name} <StopTime stop={to} region={region} emphasize={false} />
                </span>
              )}
              {when !== undefined && <span className="text-muted">· {formatRelative(when, now)}</span>}
            </div>
          )}

          {late && trip.delayReason && (
            <p className="pr-9 text-sm text-muted">
              <span className="font-medium text-text">Why: </span>
              {trip.delayReason.text}
            </p>
          )}
        </button>

        <button
          type="button"
          onClick={() => onTogglePin(trip)}
          aria-pressed={pinned}
          aria-label={`${pinned ? "Remove" : "Add"} ${mode.noun} ${trip.number} ${pinned ? "from" : "to"} My ${mode.nounPlural}`}
          className={`absolute right-3 bottom-3 grid h-9 w-9 place-items-center rounded-full text-lg transition ${
            pinned ? "bg-accent text-white" : "text-muted hover:bg-surface-2"
          }`}
        >
          {pinned ? "★" : "☆"}
        </button>
      </div>
    </li>
  );
}

export const TripCard = memo(TripCardImpl);
