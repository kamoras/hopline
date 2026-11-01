import type { Trip } from "@/domain/trip";
import { lazy, lazyStaticData, type DataFiles } from "../gtfs/dataset";
import { fetchGtfsRt } from "../gtfs/feed";
import { summarizeRouteAlerts } from "../gtfs/line-status";
import { buildSubwayArrivals, buildSubwayTrips, createSubwayStatic, subwayPlaces } from "../gtfs/subway";
import type { FetchContext, TransitProvider } from "../types";

export const MBTA_FERRY_ID = "mbta-ferry";

const files: DataFiles = (name) => import(`../../../data/mbta-ferry/${name}.json`);
const data = lazyStaticData(files, { id: MBTA_FERRY_ID, name: "MBTA Ferry" });
const loadStatic = lazy(async () => createSubwayStatic(await data(), "name"));

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

/** The MBTA's Boston Harbor ferries via its GTFS-Realtime feeds (shared with its trains and buses; only ferry routes are kept). */
export const mbtaFerryProvider: TransitProvider = {
  id: MBTA_FERRY_ID,
  name: "MBTA Ferry",
  attribution: {
    label: "MBTA",
    url: "https://www.mbta.com/developers",
    notice: "MBTA real-time data provided by the Massachusetts Bay Transportation Authority. Hopline is not affiliated with or endorsed by the MBTA.",
  },
  mode: "ferry",
  regionIds: ["boston"],

  async fetchTrips({ signal, now, diag }: FetchContext): Promise<Trip[]> {
    const [tripUpdates, vehicles] = await Promise.all([fetchFeed(FEEDS.trips, signal, now), fetchFeed(FEEDS.vehicles, signal, now)]);
    return buildSubwayTrips({ operatorId: MBTA_FERRY_ID, mode: "ferry", staticData: await loadStatic(), tripUpdates, vehicles, now, diag });
  },

  async fetchPlaces({ region }) {
    return subwayPlaces(await loadStatic(), region.id, "ferry");
  },

  async fetchArrivals({ signal, now }, place) {
    const tripUpdates = await fetchFeed(FEEDS.trips, signal, now);
    return buildSubwayArrivals({ staticData: await loadStatic(), tripUpdates, platforms: place.codes ?? [], now });
  },

  async fetchLineStatus({ signal, now }) {
    return summarizeRouteAlerts(await fetchFeed(FEEDS.alerts, signal, now, ALERTS_TTL_MS), await loadStatic(), now);
  },

  async fetchLines() {
    return (await loadStatic()).data.lines();
  },
};
