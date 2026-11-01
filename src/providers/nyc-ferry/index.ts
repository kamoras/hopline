import type { Trip } from "@/domain/trip";
import { lazy, lazyStaticData, type DataFiles } from "../gtfs/dataset";
import { fetchGtfsRt } from "../gtfs/feed";
import { summarizeRouteAlerts } from "../gtfs/line-status";
import { buildSubwayArrivals, buildSubwayTrips, createSubwayStatic, subwayPlaces } from "../gtfs/subway";
import type { FetchContext, TransitProvider } from "../types";

export const NYC_FERRY_ID = "nyc-ferry";

const files: DataFiles = (name) => import(`../../../data/nyc-ferry/${name}.json`);
const data = lazyStaticData(files, { id: NYC_FERRY_ID, name: "NYC Ferry" });
const loadStatic = lazy(async () => createSubwayStatic(await data(), "name"));

const BASE = process.env.NYC_FERRY_GTFSRT_BASE || "https://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx";
const FEEDS = {
  trips: process.env.NYC_FERRY_TRIP_UPDATES_URL || `${BASE}/tripupdate`,
  vehicles: process.env.NYC_FERRY_VEHICLE_POSITIONS_URL || `${BASE}/vehicleposition`,
  alerts: process.env.NYC_FERRY_ALERTS_URL || `${BASE}/alert`,
};
const FEED_TTL_MS = 5_000;
const ALERTS_TTL_MS = 30_000;

const fetchFeed = (url: string, signal: AbortSignal, now: number, ttlMs = FEED_TTL_MS) => fetchGtfsRt(url, signal, { ttlMs, now });

/** NYC Ferry (Hornblower) via its public GTFS-Realtime feeds: each vessel's GPS position and where it is headed. Keyless. */
export const nycFerryProvider: TransitProvider = {
  id: NYC_FERRY_ID,
  name: "NYC Ferry",
  attribution: {
    label: "NYC Ferry",
    url: "https://www.ferry.nyc/developer-tools",
    notice: "NYC Ferry schedule and real-time data are published by NYC Ferry for developers. Hopline is not affiliated with or endorsed by NYC Ferry.",
  },
  mode: "ferry",
  regionIds: ["nyc"],

  async fetchTrips({ signal, now, diag }: FetchContext): Promise<Trip[]> {
    const [tripUpdates, vehicles] = await Promise.all([fetchFeed(FEEDS.trips, signal, now), fetchFeed(FEEDS.vehicles, signal, now)]);
    return buildSubwayTrips({ operatorId: NYC_FERRY_ID, mode: "ferry", staticData: await loadStatic(), tripUpdates, vehicles, now, diag });
  },

  async fetchPlaces({ region }) {
    return subwayPlaces(await loadStatic(), region.id, "ferry");
  },

  async fetchArrivals({ signal, now }, place) {
    const tripUpdates = await fetchFeed(FEEDS.trips, signal, now);
    return buildSubwayArrivals({ staticData: await loadStatic(), tripUpdates, platforms: place.codes ?? [], now });
  },

  async fetchLineStatus({ signal, now }) {
    // Alerts are best-effort: an empty or failing alert feed means nothing to report here.
    const feed = await fetchFeed(FEEDS.alerts, signal, now, ALERTS_TTL_MS);
    return summarizeRouteAlerts(feed, await loadStatic(), now);
  },

  async fetchLines() {
    return (await loadStatic()).data.lines();
  },
};
