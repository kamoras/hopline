import type { LineStatus } from "@/domain/line-status";
import { summarizeLineStatus } from "../gtfs/line-status";
import type { FeedMessage } from "../mta/feed";
import type { NyctStatic } from "./static";

export { classifyAlert } from "../gtfs/line-status";

/** The lines riders know, in the order the MTA lists them. Anything else only appears if it has an alert. */
export const LINE_ORDER = ["1", "2", "3", "4", "5", "6", "7", "A", "C", "E", "B", "D", "F", "M", "G", "J", "Z", "L", "N", "Q", "R", "W", "S", "SIR"];

/** Express and shuttle variants roll up into the line riders think of ("6X" is the 6). */
function canonicalRoute(routeId: string, staticData: NyctStatic): string {
  const short = staticData.routes[routeId]?.short ?? routeId;
  return /^[0-9A-Z]X$/.test(short) ? short.slice(0, -1) : short;
}

/** The service picture for every subway line from the MTA's alert feed. */
export function buildLineStatus({ staticData, feed, now }: { staticData: NyctStatic; feed: FeedMessage; now: number }): LineStatus[] {
  // A line's color comes from any route that rolls up into it.
  const style = new Map<string, { color: string; text: string }>();
  for (const [id, r] of Object.entries(staticData.routes)) {
    const key = canonicalRoute(id, staticData);
    if (!style.has(key)) style.set(key, { color: r.color, text: r.text });
  }
  return summarizeLineStatus({ feed, now, order: LINE_ORDER, lineOf: (id) => canonicalRoute(id, staticData), style });
}
