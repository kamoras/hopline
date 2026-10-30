import type { DelayReason, DelayStatus, StopCall, Trip, TripState } from "./trip";

/** Both operators treat trips under 5 minutes late as on time. */
export const ON_TIME_THRESHOLD_MIN = 5;
export const MAJOR_DELAY_MIN = 15;

export function classifyDelay(minutes: number | undefined, state: TripState): DelayStatus {
  if (state === "canceled") return "canceled";
  if (minutes === undefined || Number.isNaN(minutes)) return "unknown";
  if (minutes < ON_TIME_THRESHOLD_MIN) return "on-time";
  return minutes < MAJOR_DELAY_MIN ? "minor" : "major";
}

/** Late or canceled: the cases where we owe the rider an explanation. */
export function isDelayed(t: Pick<Trip, "delayStatus">): boolean {
  return t.delayStatus === "minor" || t.delayStatus === "major" || t.delayStatus === "canceled";
}

/** "+12 min", "On time", "Canceled". */
export function formatDelay(minutes: number | undefined, status: DelayStatus): string {
  if (status === "canceled") return "Canceled";
  if (status === "unknown" || minutes === undefined) return "No live data";
  if (status === "on-time") return "On time";
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `+${h}h ${m}m` : `+${h}h`;
  }
  return `+${minutes} min`;
}

/** Friendly wording for GTFS-realtime `Alert.Cause` values. */
export const GTFS_CAUSE_TEXT: Record<string, string> = {
  TECHNICAL_PROBLEM: "Equipment or signal problem",
  STRIKE: "Labor action",
  DEMONSTRATION: "Demonstration near the tracks",
  ACCIDENT: "Accident",
  HOLIDAY: "Holiday schedule",
  WEATHER: "Weather",
  MAINTENANCE: "Track maintenance",
  CONSTRUCTION: "Construction",
  POLICE_ACTIVITY: "Police activity",
  MEDICAL_EMERGENCY: "Medical emergency",
};

/**
 * Explain a delay using only what the stop times reveal. We never guess at a
 * cause here: we report where the trip fell behind, which is what a commuter
 * can act on. Operator-supplied reasons take priority upstream of this.
 */
export function inferDelayReason(stops: readonly StopCall[]): DelayReason | undefined {
  const known = stops.filter((s) => s.delayMinutes !== undefined);
  const latest = known[known.length - 1];
  if (!latest || (latest.delayMinutes ?? 0) < ON_TIME_THRESHOLD_MIN) return undefined;

  const first = known[0]!;
  if (known.length === 1 || (first.delayMinutes ?? 0) >= ON_TIME_THRESHOLD_MIN) {
    // Already late at the first stop we have data for.
    const text =
      first.state === "departed"
        ? `Left ${first.name} ${first.delayMinutes} min late`
        : `Running ${first.delayMinutes} min behind at ${first.name}`;
    return { kind: "inferred", text };
  }

  // Find the biggest single jump between consecutive stops.
  let worst: { from: StopCall; to: StopCall; lost: number } | undefined;
  for (let i = 1; i < known.length; i++) {
    const lost = (known[i]!.delayMinutes ?? 0) - (known[i - 1]!.delayMinutes ?? 0);
    if (lost > 0 && (!worst || lost > worst.lost)) {
      worst = { from: known[i - 1]!, to: known[i]!, lost };
    }
  }
  if (worst && worst.lost >= 2) {
    return {
      kind: "inferred",
      text: `Lost ${worst.lost} min between ${worst.from.name} and ${worst.to.name}`,
    };
  }
  return { kind: "inferred", text: `Running ${latest.delayMinutes} min behind schedule` };
}
