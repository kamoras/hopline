import type { transit_realtime as rt } from "gtfs-realtime-bindings";

/** The English text of a translated string, falling back to whatever is there. */
export function englishText(ts: rt.ITranslatedString | null | undefined): string | undefined {
  const tr = ts?.translation ?? [];
  const pick = tr.find((t) => !t.language || t.language.startsWith("en")) ?? tr[0];
  return pick?.text?.trim() || undefined;
}

/** Whether an alert is in effect at `nowSec` (no active period means always; a start or end of 0 is unset, which some feeds send as "0"). */
export function isActive(alert: rt.IAlert, nowSec: number): boolean {
  const periods = alert.activePeriod ?? [];
  if (periods.length === 0) return true;
  return periods.some((p) => !(Number(p.start) > nowSec) && !(Number(p.end) > 0 && Number(p.end) < nowSec));
}
