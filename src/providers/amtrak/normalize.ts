import { inBounds, type Region } from "@/domain/region";
import type { Diagnostics, Position, StopCall, StopState, Trip } from "@/domain/trip";
import { minutesBetween } from "@/lib/time";
import { deriveState, finalizeTrip } from "../finalize";
import type { AmtrakStation, AmtrakTrain } from "./schema";
import { stationCodesFor } from "./scope";

export const AMTRAK_ID = "amtrak";
const DEFAULT_COLOR = "#0e5a9c";

const HEADING_DEGREES: Record<string, number> = {
  N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315,
  North: 0, Northeast: 45, East: 90, Southeast: 135, South: 180, Southwest: 225, West: 270, Northwest: 315,
};

function ms(iso: string): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : t;
}

function stopState(status: string): StopState {
  if (status === "Departed") return "departed";
  if (status === "Station") return "at";
  return "upcoming";
}

function normalizeStop(s: AmtrakStation): StopCall {
  const scheduledArrival = ms(s.schArr);
  const scheduledDeparture = ms(s.schDep);
  const arrival = ms(s.arr);
  const departure = ms(s.dep);
  const state = stopState(s.status);

  // A departed stop is judged on when the trip actually left; otherwise on arrival.
  const [actual, scheduled] =
    state === "departed" && departure !== undefined && scheduledDeparture !== undefined
      ? [departure, scheduledDeparture]
      : [arrival ?? departure, scheduledArrival ?? scheduledDeparture];
  const delayMinutes =
    actual !== undefined && scheduled !== undefined ? minutesBetween(actual, scheduled) : undefined;

  return {
    id: s.code,
    name: s.name || s.code,
    state,
    scheduledArrival,
    scheduledDeparture,
    arrival,
    departure,
    delayMinutes,
    platform: s.platform || undefined,
  };
}

function color(raw: string): string {
  const hex = raw.replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : DEFAULT_COLOR;
}

function position(t: AmtrakTrain): Position | undefined {
  if (!t.lat && !t.lon) return undefined;
  return {
    lat: t.lat,
    lon: t.lon,
    heading: HEADING_DEGREES[t.heading],
    speedMph: t.velocity || undefined,
    source: "reported",
  };
}

function inRegion(t: AmtrakTrain, region: Region): boolean {
  if (t.lat || t.lon) return inBounds(region, t.lat, t.lon);
  const codes = stationCodesFor(region);
  return t.stations.some((s) => codes.has(s.code));
}

const bump = (d: Diagnostics | undefined, key: string) => {
  if (d) d[key] = Number(d[key] ?? 0) + 1;
};

export function normalizeAmtrakTrip(t: AmtrakTrain, region: Region, diag?: Diagnostics): Trip | undefined {
  if (!inRegion(t, region) || t.stations.length === 0) {
    bump(diag, "outsideRegion");
    return undefined;
  }

  const stops = t.stations.filter((s) => s.code).map(normalizeStop);
  const canceled = /cancel/i.test(t.statusMsg);
  const completed = stops.length > 0 && stops.every((s) => s.state === "departed");
  if (completed) {
    bump(diag, "completed");
    return undefined;
  }

  let state = deriveState(stops, canceled);
  if (t.trainState === "Predeparture" && state !== "canceled") state = "scheduled";

  const alertText = t.alerts.map((a) => a.message.trim()).find(Boolean);
  const dueTo = /due to/i.test(t.statusMsg) ? t.statusMsg.trim() : undefined;
  const reportedText = alertText ?? dueTo;

  const number = String(t.trainNumRaw ?? t.trainNum);
  return finalizeTrip({
    id: `${AMTRAK_ID}:${t.trainID || number}`,
    operatorId: AMTRAK_ID,
    mode: "rail",
    number,
    routeName: t.routeName,
    routeColor: color(t.iconColor),
    origin: t.origName,
    destination: t.destName,
    state,
    position: position(t),
    stops,
    delayReason: reportedText ? { kind: "operator-reported", text: reportedText } : undefined,
    updatedAt: ms(t.lastValTS) ?? ms(t.updatedAt) ?? Date.now(),
  });
}
