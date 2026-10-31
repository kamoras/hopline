import type { Region } from "@/domain/region";
import { StatusPill } from "./status-pill";
import { MODES } from "@/domain/modes";
import { PlatformTag, StopTime } from "./trip-parts";
import { pinKey, type Match } from "@/lib/search";

/** Compact one-line departure: number, destination, time here (and at the destination for A-to-B). */
export function TripRow({ match, region, onOpen }: { match: Match; region: Region; onOpen(key: string): void }) {
  const { trip, stop, to } = match;
  const here = stop ?? trip.nextStop;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(pinKey(trip))}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2"
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: trip.routeColor }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="tabular font-bold">{trip.number}</span>{" "}
          <span className="font-medium">{trip.destination && <span className="font-normal text-muted">to </span>}{trip.destination}</span>
          <span className="tabular block text-sm text-muted">
            {here && <StopTime stop={here} region={region} emphasize={false} showScheduled={false} />}
            {here?.platform && (
              <>
                {" · "}
                <PlatformTag stop={here} noun={MODES[trip.mode].platformNoun} />
              </>
            )}
            {to && (
              <>
                {" → "}
                <StopTime stop={to} region={region} emphasize={false} showScheduled={false} />
              </>
            )}
          </span>
        </span>
        <StatusPill status={trip.delayStatus} minutes={trip.delayMinutes} />
      </button>
    </li>
  );
}
