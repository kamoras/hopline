import type { Region } from "@/domain/region";
import { operatorName } from "@/domain/operators";
import type { StopCall, Trip } from "@/domain/trip";
import { formatTime } from "@/lib/format";

/** "● Metro-North · New Haven Line" */
export function OperatorLine({ trip }: { trip: Pick<Trip, "operatorId" | "routeName" | "routeColor"> }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-muted">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: trip.routeColor }} aria-hidden />
      <span className="truncate">
        {operatorName(trip.operatorId)} · {trip.routeName}
      </span>
    </div>
  );
}

export function stopTimes(stop: StopCall) {
  const actual = stop.arrival ?? stop.departure;
  const scheduled = stop.scheduledArrival ?? stop.scheduledDeparture;
  const changed = actual !== undefined && scheduled !== undefined && Math.abs(actual - scheduled) > 60_000;
  return { actual, scheduled, changed };
}

/** The live time, with the timetable time struck through when they differ. */
export function StopTime({
  stop,
  region,
  emphasize = true,
  showScheduled = true,
}: {
  stop: StopCall;
  region: Region;
  emphasize?: boolean;
  /** Also show the timetable time, struck through, when it differs. */
  showScheduled?: boolean;
}) {
  const { actual, scheduled, changed } = stopTimes(stop);
  return (
    <>
      <span className={changed && emphasize ? "font-semibold" : ""}>{formatTime(actual, region.timeZone)}</span>
      {changed && showScheduled && <span className="ml-2 text-muted line-through">{formatTime(scheduled, region.timeZone)}</span>}
    </>
  );
}
