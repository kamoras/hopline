"use client";

import { useEffect } from "react";
import type { Region } from "@/domain/region";
import type { StopCall, Trip } from "@/domain/trip";
import { isDelayed } from "@/domain/delay";
import { MODES } from "@/domain/modes";
import { StatusPill } from "./status-pill";
import { OperatorLine, StopTime } from "./trip-parts";

interface Props {
  trip: Trip;
  region: Region;
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

function StopRow({ stop, region, isNext, isLast }: { stop: StopCall; region: Region; isNext: boolean; isLast: boolean }) {
  const done = stop.state === "departed";
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!isLast && <span className="absolute top-4 left-[7px] h-full w-0.5 bg-line" aria-hidden />}
      <span
        className={`relative z-10 mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${
          done ? "border-line bg-line" : isNext ? "border-accent bg-accent" : "border-line bg-surface"
        }`}
        aria-hidden
      />
      <div className={`flex min-w-0 flex-1 items-baseline justify-between gap-3 ${done ? "text-muted" : ""}`}>
        <span className={`truncate ${isNext ? "font-semibold" : ""}`}>
          {stop.name}
          {isNext && <span className="ml-2 text-xs font-semibold text-accent uppercase">{stop.state === "at" ? "Here now" : "Next"}</span>}
        </span>
        <span className="tabular shrink-0 text-sm">
          <StopTime stop={stop} region={region} emphasize={!done} />
        </span>
      </div>
    </li>
  );
}

export function TripDetail({ trip, region, pinned, showMapButton, onClose, onTogglePin, onShowOnMap }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mode = MODES[trip.mode];
  const late = isDelayed(trip);
  const nextIdx = trip.stops.findIndex((s) => s.state !== "departed");

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
            <p className="text-sm text-muted">from {trip.origin}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl text-muted hover:bg-surface-2" aria-label="Close">
            ×
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={trip.delayStatus} minutes={trip.delayMinutes} size="lg" />
            {trip.position && (
              <span className="text-sm text-muted">
                {trip.position.source === "reported" ? "Live GPS" : "Estimated from schedule"}
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
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${pinned ? "bg-accent text-white" : "border border-line hover:bg-surface-2"}`}
            >
              {pinned ? `★ In My ${mode.nounPlural}` : `☆ Add to My ${mode.nounPlural}`}
            </button>
            {showMapButton && trip.position && (
              <button type="button" onClick={onShowOnMap} className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
                Show on map
              </button>
            )}
          </div>

          <section aria-label="Stops">
            <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">Stops</h3>
            <ol>
              {trip.stops.map((s, i) => (
                <StopRow key={`${s.id}-${i}`} stop={s} region={region} isNext={i === nextIdx} isLast={i === trip.stops.length - 1} />
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
