"use client";

import Link from "next/link";
import { useEffect } from "react";
import { placeHref, tripHref, type BoardLink } from "@/domain/board";
import { MODES } from "@/domain/modes";
import type { Place } from "@/domain/place";
import { getRegion, NORTHEAST } from "@/domain/region";
import type { Trip } from "@/domain/trip";
import { useArrivals } from "@/hooks/use-arrivals";
import { formatRelative } from "@/lib/format";
import { groupArrivals, minutesUntil } from "@/lib/arrivals";
import { pinKey } from "@/lib/search";
import { LineBadge } from "../line-badge";
import { StatusPill } from "../status-pill";
import { destinationPhrase, OperatorLine, PlatformTag, StopTime, stopTimes } from "../trip-parts";

/** The answer card: what a person tapped on the map, with the one thing they came for, and a way to see more. */
export function ModelPeek({
  selection,
  now,
  onClose,
}: {
  selection: { kind: "trip"; trip: Trip; board: BoardLink } | { kind: "place"; place: Place; board: BoardLink };
  now: number;
  onClose(): void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      aria-label={selection.kind === "trip" ? `${MODES[selection.trip.mode].numberLabel} ${selection.trip.number}` : selection.place.name}
      className="sheet-in absolute right-3 bottom-3 left-3 z-10 max-h-[55%] overflow-y-auto rounded-3xl border border-line bg-surface p-4 shadow-lift sm:right-auto sm:w-[390px]"
    >
      <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full text-xl text-muted hover:bg-surface-2">
        ×
      </button>
      {selection.kind === "trip" ? <TripAnswer trip={selection.trip} board={selection.board} now={now} /> : <PlaceAnswer place={selection.place} board={selection.board} now={now} />}
    </aside>
  );
}

function TripAnswer({ trip, board, now }: { trip: Trip; board: BoardLink; now: number }) {
  const mode = MODES[trip.mode];
  const region = getRegion(board.regionId) ?? NORTHEAST;
  const next = trip.nextStop;
  const when = next && stopTimes(next).actual;
  // A big network does not open a single vehicle by link; its answer is here, and the board shows the rest.
  const href = mode.viewport ? board.href : tripHref(board.href, pinKey(trip));
  return (
    <div className="space-y-3 pr-8">
      <OperatorLine trip={trip} />
      <h2 className="text-2xl font-bold tracking-tight">
        <span className="tabular">{trip.number}</span> {destinationPhrase(trip)}
      </h2>
      {mode.reportsDelay && <StatusPill status={trip.delayStatus} minutes={trip.delayMinutes} size="lg" />}
      {next && (
        <p className="tabular text-[15px]">
          <span className="text-muted">Next </span>
          <span className="font-semibold">{next.name}</span> <StopTime stop={next} region={region} emphasize={false} />{" "}
          <PlatformTag stop={next} noun={mode.platformNoun} />
          {when !== undefined && <span className="text-muted"> · {formatRelative(when, now)}</span>}
        </p>
      )}
      {trip.position?.altitudeFt ? <p className="text-sm text-muted">{trip.position.altitudeFt.toLocaleString("en-US")} ft{trip.position.speedMph ? ` · ${Math.round(trip.position.speedMph)} mph` : ""}</p> : null}
      <Link href={href} className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white press">
        {mode.viewport ? `Open ${mode.label} · ${board.regionName}` : "Full details"} <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function PlaceAnswer({ place, board, now }: { place: Place; board: BoardLink; now: number }) {
  const mode = MODES[board.mode];
  const stationsFirst = mode.browse === "stations";
  const { arrivals, isLoading } = useArrivals(board.mode, board.regionId, stationsFirst ? place.id : undefined);
  const groups = groupArrivals(arrivals, now).slice(0, 4);
  return (
    <div className="space-y-3 pr-8">
      <div>
        <div className="text-sm text-muted">{stationsFirst ? `Next ${mode.nounPlural} at` : `${mode.label} · ${board.regionName}`}</div>
        <h2 className="text-2xl font-bold tracking-tight">{place.name}</h2>
      </div>
      {stationsFirst && (
        <ul className="space-y-1.5" aria-label={`Next ${mode.nounPlural}`}>
          {isLoading && groups.length === 0 && <li className="skeleton h-12 rounded-xl" aria-hidden />}
          {!isLoading && groups.length === 0 && <li className="text-sm text-muted">No {mode.nounPlural} due in the next 45 minutes.</li>}
          {groups.map((g) => (
            <li key={g.key} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
              <LineBadge route={g.route} color={g.color} textColor={g.textColor} size={26} label={g.route} />
              <span className="min-w-0 flex-1 truncate font-medium">{mode.slug === "flights" ? "" : "to "}{g.headsign}</span>
              <span className="tabular text-lg font-bold">{minutesUntil(g.times[0]!, now) === 0 ? "Due" : `${minutesUntil(g.times[0]!, now)} min`}</span>
            </li>
          ))}
        </ul>
      )}
      <Link href={placeHref(board.href, place.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white press">
        {stationsFirst ? "All arrivals" : "Departures"} <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
