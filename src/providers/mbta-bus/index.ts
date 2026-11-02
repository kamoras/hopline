import type { Trip } from "@/domain/trip";
import { fetchGtfsRt } from "../gtfs/feed";
import { summarizeRouteAlerts } from "../gtfs/line-status";
import { buildSubwayArrivals, buildSubwayTrips, subwayPlaces, subwayRoutes } from "../gtfs/subway";
import type { FetchContext, TransitProvider } from "../types";
import { loadMbtaBusStatic, MBTA_BUS_ID } from "./static";

const FEEDS = {
  trips: process.env.MBTA_TRIP_UPDATES_URL || "https://cdn.mbta.com/realtime/TripUpdates.pb",
  vehicles: process.env.MBTA_VEHICLE_POSITIONS_URL || "https://cdn.mbta.com/realtime/VehiclePositions.pb",
  alerts: process.env.MBTA_ALERTS_URL || "https://cdn.mbta.com/realtime/Alerts.pb",
};
const FEED_TTL_MS = 5_000;
const ALERTS_TTL_MS = 30_000;

/** Sent as `x-api-key` when set: optional, but raises the MBTA's rate limit. */
const headers = (): Record<string, string> => (process.env.MBTA_API_KEY ? { "x-api-key": process.env.MBTA_API_KEY } : {});
const fetchFeed = (url: string, signal: AbortSignal, now: number, ttlMs = FEED_TTL_MS) => fetchGtfsRt(url, signal, { headers: headers(), ttlMs, now });

/** The T's buses via the MBTA's GTFS-Realtime feeds (shared with its trains and ferries; only bus routes are kept). */
export const mbtaBusProvider: TransitProvider = {
  id: MBTA_BUS_ID,
  name: "MBTA Bus",
  attribution: {
    label: "MBTA",
    url: "https://www.mbta.com/developers",
    notice: "MBTA real-time data provided by the Massachusetts Bay Transportation Authority. Hopline is not affiliated with or endorsed by the MBTA.",
  },
  mode: "bus",
  regionIds: ["boston"],

  async fetchTrips({ signal, now, diag }: FetchContext): Promise<Trip[]> {
    const [tripUpdates, vehicles] = await Promise.all([fetchFeed(FEEDS.trips, signal, now), fetchFeed(FEEDS.vehicles, signal, now)]);
    return buildSubwayTrips({ operatorId: MBTA_BUS_ID, mode: "bus", staticData: await loadMbtaBusStatic(), tripUpdates, vehicles, now, diag });
  },

  async fetchPlaces({ region }) {
    return subwayPlaces(await loadMbtaBusStatic(), region.id, "bus");
  },

  async fetchArrivals({ signal, now }, place) {
    const tripUpdates = await fetchFeed(FEEDS.trips, signal, now);
    return buildSubwayArrivals({ staticData: await loadMbtaBusStatic(), tripUpdates, platforms: place.codes ?? [], now });
  },

  async fetchLineStatus({ signal, now }) {
    return summarizeRouteAlerts(await fetchFeed(FEEDS.alerts, signal, now, ALERTS_TTL_MS), await loadMbtaBusStatic(), now);
  },

  async fetchLines({ route }) {
    return (await loadMbtaBusStatic()).data.lines(route);
  },

  async fetchRoutes() {
    return subwayRoutes(await loadMbtaBusStatic());
  },
};
