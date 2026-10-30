const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = cache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
    cache.set(timeZone, f);
  }
  return f;
}

/** "6:42 PM" in the region's time zone. */
export function formatTime(ms: number | undefined, timeZone: string): string {
  return ms === undefined ? "—" : formatter(timeZone).format(ms);
}

/** "in 4 min", "now", "5 min ago". */
export function formatRelative(ms: number, now: number): string {
  const min = Math.round((ms - now) / 60_000);
  if (min === 0) return "now";
  const abs = Math.abs(min);
  const label = abs >= 90 ? `${Math.round(abs / 60)} hr` : `${abs} min`;
  return min > 0 ? `in ${label}` : `${label} ago`;
}

export function formatAgo(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 5) return "just now";
  if (s < 90) return `${s}s ago`;
  return `${Math.round(s / 60)} min ago`;
}
