const MIN = 60_000;

export function minutesBetween(later: number, earlier: number): number {
  return Math.round((later - earlier) / MIN);
}

/** Offset of `timeZone` from UTC, in ms, at the given instant. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * GTFS service-day origin: noon on the service date minus 12 hours, in the
 * agency's time zone. Stop times (which may exceed 24:00:00) are offsets from it.
 */
export function serviceDayStart(yyyymmdd: string, timeZone: string): number {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const noonUtc = Date.UTC(y, m - 1, d, 12);
  const offset = zoneOffsetMs(noonUtc, timeZone);
  return noonUtc - offset - 12 * 60 * MIN;
}

/** YYYYMMDD for the given instant in `timeZone`. */
export function dateInZone(instant: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}
