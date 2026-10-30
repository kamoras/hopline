import type { Arrival } from "@/domain/arrival";

const MIN = 60_000;
/** A wait this long for the next train is worth warning about. */
export const LONG_WAIT_MIN = 15;

export interface ArrivalGroup {
  key: string;
  route: string;
  color: string;
  textColor: string;
  headsign: string;
  /** Epoch ms of the upcoming trains, soonest first. */
  times: number[];
  /** Set when riders should expect an unusually long wait. */
  warning?: string;
}

/** Whole minutes until `at`, never negative ("Due" is 0). */
export const minutesUntil = (at: number, now: number) => Math.max(0, Math.floor((at - now) / MIN));

/**
 * A short, honest warning when service looks sparse: the next train is far off, or there is a hole
 * in the sequence much bigger than the usual spacing. Informational; schedules vary by hour.
 */
export function longGapWarning(times: readonly number[], now: number): string | undefined {
  const first = times[0];
  if (first === undefined) return undefined;
  const wait = Math.round((first - now) / MIN);
  if (wait >= LONG_WAIT_MIN) return `Long wait: next train in ${wait} min`;
  const gaps = times.slice(1).map((t, i) => Math.round((t - times[i]!) / MIN));
  if (gaps.length >= 2) {
    const typical = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
    const worst = Math.max(...gaps);
    if (worst >= LONG_WAIT_MIN && worst >= 2 * Math.max(typical, 1)) return `Gap of ${worst} min between trains`;
  }
  return undefined;
}

/**
 * Groups arrivals by line and destination, so a station reads "A to Inwood: 2, 7, 12 min" and
 * "A to Far Rockaway: 4, 11 min". Groups are ordered by their next train.
 */
export function groupArrivals(arrivals: readonly Arrival[], now: number, perGroup = 4): ArrivalGroup[] {
  const groups = new Map<string, ArrivalGroup>();
  for (const a of [...arrivals].sort((x, y) => x.at - y.at)) {
    if (a.at < now - 15_000) continue; // already left
    const key = `${a.route}|${a.headsign}`;
    const g = groups.get(key) ?? { key, route: a.route, color: a.color, textColor: a.textColor, headsign: a.headsign, times: [] };
    g.times.push(a.at);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, warning: longGapWarning(g.times, now), times: g.times.slice(0, perGroup) }))
    .sort((a, b) => a.times[0]! - b.times[0]!);
}
