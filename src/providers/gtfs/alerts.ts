import { transit_realtime as rt } from "gtfs-realtime-bindings";
import { GTFS_CAUSE_TEXT } from "@/domain/delay";
import type { DelayReason } from "@/domain/trip";
import { englishText, isActive } from "./alert-utils";
import type { FeedMessage } from "./feed";

export interface AlertIndex {
  byTrip: Map<string, DelayReason>;
  byRoute: Map<string, DelayReason>;
}

const IMPACTFUL = new Set([
  rt.Alert.Effect.SIGNIFICANT_DELAYS,
  rt.Alert.Effect.REDUCED_SERVICE,
  rt.Alert.Effect.DETOUR,
  rt.Alert.Effect.NO_SERVICE,
]);

function reasonFor(alert: rt.IAlert): DelayReason | undefined {
  const cause = alert.cause != null ? rt.Alert.Cause[alert.cause] : undefined;
  const causeText = cause ? GTFS_CAUSE_TEXT[cause] : undefined;
  const header = englishText(alert.headerText);
  const shortHeader = header && header.length <= 140 ? header : undefined;
  const text = shortHeader ?? causeText ?? (header ? `${header.slice(0, 137)}…` : undefined);
  return text ? { kind: "operator-reported", text } : undefined;
}

/** Indexes active alerts so each trip can look up an operator-reported reason. */
export function indexAlerts(feed: FeedMessage | undefined, now: number): AlertIndex {
  const index: AlertIndex = { byTrip: new Map(), byRoute: new Map() };
  if (!feed) return index;
  const nowSec = Math.floor(now / 1000);

  for (const entity of feed.entity) {
    const alert = entity.alert;
    if (!alert || !isActive(alert, nowSec)) continue;
    const reason = reasonFor(alert);
    if (!reason) continue;
    const significant = (alert.effect != null && IMPACTFUL.has(alert.effect)) || !!alert.cause;
    for (const informed of alert.informedEntity ?? []) {
      const tripId = informed.trip?.tripId;
      const routeId = informed.routeId ?? informed.trip?.routeId;
      if (tripId) index.byTrip.set(tripId, reason);
      else if (routeId && significant && !index.byRoute.has(routeId)) index.byRoute.set(routeId, reason);
    }
  }
  return index;
}
