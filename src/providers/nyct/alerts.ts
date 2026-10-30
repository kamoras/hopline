import { transit_realtime as rt } from "gtfs-realtime-bindings";
import { LINE_STATE_RANK, type LineAlert, type LineState, type LineStatus } from "@/domain/line-status";
import { englishText, isActive } from "../mta/alert-utils";
import type { FeedMessage } from "../mta/feed";
import type { NyctStatic } from "./static";

/** The lines riders know, in the order the MTA lists them. Anything else only appears if it has an alert. */
export const LINE_ORDER = ["1", "2", "3", "4", "5", "6", "7", "A", "C", "E", "B", "D", "F", "M", "G", "J", "Z", "L", "N", "Q", "R", "W", "S", "SIR"];

const MAX_ALERTS_PER_LINE = 4;
const PLANNED = /\b(planned|weekends?|late[- ]nights?|overnight|track work|maintenance|construction)\b/i;
const DELAYS = /\bdelay/i;

const { Effect } = rt.Alert;

/**
 * What an alert means for riders, or nothing if it isn't about running service (an elevator out of
 * service is real but is not the line's status). Effects are the feed's own; text fills the gaps.
 */
export function classifyAlert(effect: rt.Alert.Effect | null | undefined, text: string): LineState | undefined {
  if (effect === Effect.NO_SERVICE) return "suspended";
  if (effect === Effect.SIGNIFICANT_DELAYS || DELAYS.test(text)) return "delays";
  if (PLANNED.test(text)) return effect === Effect.ACCESSIBILITY_ISSUE ? undefined : "planned";
  if (effect === Effect.DETOUR || effect === Effect.MODIFIED_SERVICE || effect === Effect.REDUCED_SERVICE || effect === Effect.ADDITIONAL_SERVICE) return "change";
  return undefined;
}

/** Express and shuttle variants roll up into the line riders think of ("6X" is the 6). */
function canonicalRoute(routeId: string, staticData: NyctStatic): string {
  const short = staticData.routes[routeId]?.short ?? routeId;
  return /^[0-9A-Z]X$/.test(short) ? short.slice(0, -1) : short;
}

/**
 * The service picture for every line from the MTA's alert feed: the worst state among its active
 * alerts, with the alerts themselves so riders can see why. Lines with nothing active are "good".
 */
export function buildLineStatus({ staticData, feed, now }: { staticData: NyctStatic; feed: FeedMessage; now: number }): LineStatus[] {
  const nowSec = Math.floor(now / 1000);
  const byLine = new Map<string, Map<string, LineAlert>>();

  for (const entity of feed.entity) {
    const alert = entity.alert;
    if (!alert || !isActive(alert, nowSec)) continue;
    const headline = englishText(alert.headerText);
    if (!headline) continue;
    const detail = englishText(alert.descriptionText);
    const state = classifyAlert(alert.effect, `${headline} ${detail ?? ""}`);
    if (!state) continue;
    for (const informed of alert.informedEntity ?? []) {
      if (!informed.routeId) continue;
      const route = canonicalRoute(informed.routeId, staticData);
      const alerts = byLine.get(route) ?? new Map<string, LineAlert>();
      alerts.set(headline, { headline, detail: detail && detail !== headline ? detail : undefined, state });
      byLine.set(route, alerts);
    }
  }

  // A line's color comes from any route that rolls up into it.
  const style = new Map<string, { color: string; text: string }>();
  for (const [id, r] of Object.entries(staticData.routes)) {
    const key = canonicalRoute(id, staticData);
    if (!style.has(key)) style.set(key, { color: r.color, text: r.text });
  }

  const routes = [...LINE_ORDER, ...[...byLine.keys()].filter((r) => !LINE_ORDER.includes(r)).sort()];
  return routes.flatMap((route) => {
    const look = style.get(route);
    if (!look) return [];
    const alerts = [...(byLine.get(route)?.values() ?? [])]
      .sort((a, b) => LINE_STATE_RANK[b.state] - LINE_STATE_RANK[a.state])
      .slice(0, MAX_ALERTS_PER_LINE);
    const state: LineState = alerts[0]?.state ?? "good";
    return [{ route, color: look.color, textColor: look.text, state, alerts }];
  });
}
