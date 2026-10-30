import { transit_realtime as rt } from "gtfs-realtime-bindings";
import type { Region } from "@/domain/region";
import type { Diagnostics, Position, StopCall, Trip } from "@/domain/trip";
import type { MotionLeg } from "@/lib/motion";
import { pointAlong, project, slicePolyline } from "@/lib/polyline";
import { finalizeTrip } from "../finalize";
import type { FeedMessage } from "../mta/feed";
import type { Direction, NyctStatic } from "./static";

export const NYCT_ID = "nyct";

/** Average speed between stations (m/s) when the feed gives nothing better; about 25 mph including stops. */
const DEFAULT_SPEED = 11;
const MIN_SPEED = 4;
const MAX_SPEED = 25;
/** A station further than this from the trip's track means the geometry isn't this trip's. */
const MAX_OFF_TRACK_M = 400;
/** Updates this far in the past are stops already served (feeds sometimes keep them briefly). */
const PASSED_GRACE_MS = 30_000;
/** Trips that have not started and won't for a while aren't on the map yet. */
const STARTS_WITHIN_MS = 15 * 60_000;
/** Stops sent per trip: the next few and the destination. Station arrivals are served separately. */
const STOPS_KEPT = 3;

export interface NyctInput {
  staticData: NyctStatic;
  feeds: readonly FeedMessage[];
  region: Region;
  now: number;
  diag?: Diagnostics;
}

const bump = (d: Diagnostics | undefined, key: string) => {
  if (d) d[key] = Number(d[key] ?? 0) + 1;
};

/** Feed times are seconds and the field exists only when set (absent numbers decode as 0). */
function timeMs(ev: rt.TripUpdate.IStopTimeEvent | null | undefined): number | undefined {
  return ev && Object.hasOwn(ev, "time") && Number(ev.time) > 0 ? Number(ev.time) * 1000 : undefined;
}

const directionOf = (platformId: string): Direction | undefined => {
  const d = platformId.at(-1);
  return d === "N" || d === "S" ? d : undefined;
};

/**
 * Subway trips from the realtime feeds. The feeds give each train its upcoming stops and arrival
 * times, but no coordinates and no history, so position is estimated: the next stop's place on the
 * track, minus the distance the train covers in the time it still needs to get there.
 */
export function buildNyctTrips({ staticData, feeds, now, diag }: NyctInput): Trip[] {
  const vehicles = new Map<string, rt.IVehiclePosition>();
  for (const feed of feeds) for (const e of feed.entity) if (e.vehicle?.trip?.tripId) vehicles.set(e.vehicle.trip.tripId, e.vehicle);

  const trips: Trip[] = [];
  for (const feed of feeds) {
    for (const entity of feed.entity) {
      const tu = entity.tripUpdate;
      const tripId = tu?.trip?.tripId;
      const routeId = tu?.trip?.routeId;
      if (!tu || !tripId || !routeId) continue;
      bump(diag, "tripUpdates");
      const route = staticData.routes[routeId];
      if (!route) {
        bump(diag, "unknownRoute");
        continue;
      }

      const upcoming = (tu.stopTimeUpdate ?? []).flatMap((u) => {
        const at = timeMs(u.arrival) ?? timeMs(u.departure);
        const station = u.stopId ? staticData.stationOfPlatform(u.stopId) : undefined;
        return at !== undefined && station && u.stopId && at >= now - PASSED_GRACE_MS ? [{ platform: u.stopId, station, at }] : [];
      });
      const next = upcoming[0];
      const last = upcoming.at(-1);
      if (!next || !last) {
        bump(diag, "finishedOrEmpty");
        continue;
      }
      const dir = directionOf(next.platform) ?? "N";
      const vehicle = vehicles.get(tripId);
      const stoppedAtNext = vehicle?.currentStatus === rt.VehiclePosition.VehicleStopStatus.STOPPED_AT && vehicle.stopId === next.platform;
      const waiting = next.at - now > STARTS_WITHIN_MS && !stoppedAtNext;
      if (waiting) {
        bump(diag, "notStartedYet");
        continue;
      }

      const shape = staticData.shapeFor(tripId, routeId, dir);
      let position: Position | undefined;
      let motion: MotionLeg[] | undefined;
      if (shape) {
        const first = project(shape, next.station);
        if (first.offMeters <= MAX_OFF_TRACK_M) {
          const second = upcoming[1] ? project(shape, upcoming[1].station) : undefined;
          const dt = upcoming[1] ? (upcoming[1].at - next.at) / 1000 : 0;
          const measured = second && dt > 10 ? Math.abs(second.along - first.along) / dt : DEFAULT_SPEED;
          const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, measured));
          // Shapes run in the direction of travel, so the train is behind its next stop along the track.
          const eta = Math.max(0, (next.at - now) / 1000);
          const along = stoppedAtNext || eta === 0 ? first.along : Math.max(0, first.along - speed * eta);
          const p = pointAlong(shape, along);
          position = { lat: p.lat, lon: p.lon, heading: p.heading, source: "estimated" };
          if (along < first.along - 1) motion = [{ t0: now, t1: next.at, path: slicePolyline(shape, along, first.along) }];
        } else bump(diag, "offTrack");
      } else bump(diag, "noShape");

      const stops: StopCall[] = [...upcoming.slice(0, STOPS_KEPT), ...(upcoming.length > STOPS_KEPT ? [last] : [])].map((u, i) => ({
        id: u.station.id,
        name: u.station.name,
        state: i === 0 && stoppedAtNext ? "at" : "upcoming",
        arrival: u.at,
        departure: u.at,
      }));

      bump(diag, "kept");
      trips.push(
        finalizeTrip({
          id: `${NYCT_ID}:${tripId}`,
          operatorId: NYCT_ID,
          mode: "subway",
          number: route.short,
          routeName: route.long,
          routeColor: route.color,
          origin: "",
          destination: last.station.name,
          state: stoppedAtNext ? "at-station" : "enroute",
          position,
          motion,
          stops,
          updatedAt: Number(vehicle?.timestamp ?? tu.timestamp ?? feed.header.timestamp ?? 0) * 1000 || now,
        }),
      );
    }
  }
  if (diag) diag.feedsUsed = feeds.length;
  return trips;
}
