import { classifyDelay, inferDelayReason } from "@/domain/delay";
import type { DelayReason, Trip, TripState } from "@/domain/trip";

type Draft = Omit<Trip, "delayStatus" | "nextStop" | "delayMinutes" | "delayReason"> & {
  delayReason?: DelayReason;
};

/**
 * Derives the fields every provider computes identically (next stop, headline
 * delay, status bucket, inferred reason) so adapters only map raw data.
 */
export function finalizeTrip(draft: Draft): Trip {
  const nextStop = draft.stops.find((s) => s.state !== "departed");
  const withData = draft.stops.filter((s) => s.delayMinutes !== undefined);
  const reference = nextStop?.delayMinutes !== undefined ? nextStop : withData[withData.length - 1];
  const delayMinutes = reference?.delayMinutes;
  const delayStatus = classifyDelay(delayMinutes, draft.state);

  const delayReason =
    draft.delayReason ??
    (delayStatus === "minor" || delayStatus === "major" ? inferDelayReason(draft.stops) : undefined);

  return { ...draft, nextStop, delayMinutes, delayStatus, delayReason };
}

export function deriveState(stops: Trip["stops"], canceled: boolean): TripState {
  if (canceled) return "canceled";
  if (stops.length === 0) return "scheduled";
  if (stops.every((s) => s.state === "departed")) return "completed";
  if (stops.some((s) => s.state === "at")) return "at-station";
  if (stops[0]?.state === "upcoming") return "scheduled";
  return "enroute";
}
