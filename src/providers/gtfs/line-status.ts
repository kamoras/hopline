import { transit_realtime as rt } from "gtfs-realtime-bindings";
import { LINE_STATE_RANK, type LineAlert, type LineState, type LineStatus } from "@/domain/line-status";
import { englishText, isActive } from "./alert-utils";
import type { FeedMessage } from "./feed";
import type { SubwayStatic } from "./subway";

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

export interface LineStatusInput {
  feed: FeedMessage;
  now: number;
  /** The lines riders know, in display order. Anything else only appears if it has an alert. */
  order: readonly string[];
  /** The public line an alert's route id rolls up into ("6X" is the 6), or nothing to ignore it. */
  lineOf(routeId: string): string | undefined;
  /** Colors per public line; a line with no style is not shown. */
  style: ReadonlyMap<string, { color: string; text: string }>;
}

/**
 * The service picture for every line from an operator's alert feed: the worst state among its active
 * alerts, with the alerts themselves so riders can see why. Lines with nothing active are "good".
 */
export function summarizeLineStatus({ feed, now, order, lineOf, style }: LineStatusInput): LineStatus[] {
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
      const route = informed.routeId ? lineOf(informed.routeId) : undefined;
      if (!route) continue;
      const alerts = byLine.get(route) ?? new Map<string, LineAlert>();
      // "No service" at one stop (a closed stop or station) is not the route stopping.
      const scoped = informed.stopId && state === "suspended" ? "change" : state;
      alerts.set(headline, { headline, detail: detail && detail !== headline ? detail : undefined, state: scoped });
      byLine.set(route, alerts);
    }
  }

  const routes = [...order, ...[...byLine.keys()].filter((r) => !order.includes(r)).sort()];
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

/**
 * What is wrong on a bus system's routes right now. A city has hundreds of routes, so only routes with an active alert
 * are listed (worst first); an empty list means nothing to report. Routes the schedule doesn't know are ignored, which
 * also drops other modes from feeds shared with them (the MBTA's alerts cover trains and ferries too).
 */
export function summarizeRouteAlerts(feed: FeedMessage, staticData: SubwayStatic, now: number): LineStatus[] {
  const style = new Map(Object.values(staticData.lines).map((l) => [l.short, { color: l.color, text: l.text ?? "#FFFFFF" }]));
  return summarizeLineStatus({ feed, now, order: [], lineOf: (routeId) => staticData.lines[routeId]?.short, style }).sort(
    (a, b) => LINE_STATE_RANK[b.state] - LINE_STATE_RANK[a.state] || a.route.localeCompare(b.route, undefined, { numeric: true }),
  );
}
