import type { Trip } from "@/domain/trip";
import { fetchGtfsRt } from "../gtfs/feed";
import { summarizeRouteAlerts } from "../gtfs/line-status";
import { buildSubwayArrivals, buildSubwayTrips, subwayPlaces } from "../gtfs/subway";
import type { FetchContext, TransitProvider } from "../types";
import { loadSeptaBusStatic, SEPTA_BUS_ID } from "./static";

const BASE = process.env.SEPTA_GTFSRT_BASE || "https://www3.septa.org/gtfsrt/septa-pa-us";
const FEEDS = {
  trips: process.env.SEPTA_TRIP_UPDATES_URL || `${BASE}/Trip/rtTripUpdates.pb`,
  vehicles: process.env.SEPTA_VEHICLE_POSITIONS_URL || `${BASE}/Vehicle/rtVehiclePosition.pb`,
  alerts: process.env.SEPTA_ALERTS_URL || `${BASE}/Service/rtServiceAlerts.pb`,
};
const FEED_TTL_MS = 5_000;
const ALERTS_TTL_MS = 30_000;

const fetchFeed = (url: string, signal: AbortSignal, now: number, ttlMs = FEED_TTL_MS) => fetchGtfsRt(url, signal, { ttlMs, now });

/** SEPTA's buses and trolleys (Philadelphia and its suburbs) via SEPTA's GTFS-Realtime feeds (keyless). */
export const septaBusProvider: TransitProvider = {
  id: SEPTA_BUS_ID,
  name: "SEPTA Bus",
  attribution: {
    label: "SEPTA",
    url: "https://www.septa.org/developer/",
    notice: "SEPTA schedule and real-time data provided by the Southeastern Pennsylvania Transportation Authority. Hopline is not affiliated with or endorsed by SEPTA.",
  },
  mode: "bus",
  regionIds: ["philadelphia"],

  async fetchTrips({ signal, now, diag }: FetchContext): Promise<Trip[]> {
    const [tripUpdates, vehicles] = await Promise.all([fetchFeed(FEEDS.trips, signal, now), fetchFeed(FEEDS.vehicles, signal, now)]);
    return buildSubwayTrips({ operatorId: SEPTA_BUS_ID, mode: "bus", staticData: await loadSeptaBusStatic(), tripUpdates, vehicles, now, diag });
  },

  async fetchPlaces({ region }) {
    return subwayPlaces(await loadSeptaBusStatic(), region.id, "bus");
  },

  async fetchArrivals({ signal, now }, place) {
    const tripUpdates = await fetchFeed(FEEDS.trips, signal, now);
    return buildSubwayArrivals({ staticData: await loadSeptaBusStatic(), tripUpdates, platforms: place.codes ?? [], now });
  },

  async fetchLineStatus({ signal, now }) {
    return summarizeRouteAlerts(await fetchFeed(FEEDS.alerts, signal, now, ALERTS_TTL_MS), await loadSeptaBusStatic(), now);
  },

  async fetchLines() {
    return (await loadSeptaBusStatic()).data.lines();
  },
};
