import type { Trip } from "@/domain/trip";
import { summarizeRouteAlerts } from "../gtfs/line-status";
import { buildSubwayArrivals, buildSubwayTrips, subwayPlaces } from "../gtfs/subway";
import type { FetchContext, TransitProvider } from "../types";
import { fetchWmataFeed as fetchFeed, WMATA_BASE } from "../wmata/feeds";
import { loadWmataBusStatic, WMATA_BUS_ID } from "./static";

const FEEDS = {
  trips: process.env.WMATA_BUS_TRIP_UPDATES_URL || `${WMATA_BASE}/bus-gtfsrt-tripupdates.pb`,
  vehicles: process.env.WMATA_BUS_VEHICLE_POSITIONS_URL || `${WMATA_BASE}/bus-gtfsrt-vehiclepositions.pb`,
  alerts: process.env.WMATA_BUS_ALERTS_URL || `${WMATA_BASE}/bus-gtfsrt-alerts.pb`,
};
const ALERTS_TTL_MS = 30_000;

/** Washington's Metrobus via WMATA's GTFS-Realtime feeds (same key as Metrorail). */
export const wmataBusProvider: TransitProvider = {
  id: WMATA_BUS_ID,
  name: "Metrobus",
  attribution: {
    label: "WMATA",
    url: "https://developer.wmata.com",
    notice: "Metrobus real-time data provided by the Washington Metropolitan Area Transit Authority (WMATA). Hopline is not affiliated with or endorsed by WMATA.",
  },
  mode: "bus",
  regionIds: ["washington"],

  async fetchTrips({ signal, now, diag }: FetchContext): Promise<Trip[]> {
    const [tripUpdates, vehicles] = await Promise.all([fetchFeed(FEEDS.trips, signal, now), fetchFeed(FEEDS.vehicles, signal, now)]);
    return buildSubwayTrips({ operatorId: WMATA_BUS_ID, mode: "bus", staticData: await loadWmataBusStatic(), tripUpdates, vehicles, now, diag });
  },

  async fetchPlaces({ region }) {
    return subwayPlaces(await loadWmataBusStatic(), region.id, "bus");
  },

  async fetchArrivals({ signal, now }, place) {
    const tripUpdates = await fetchFeed(FEEDS.trips, signal, now);
    return buildSubwayArrivals({ staticData: await loadWmataBusStatic(), tripUpdates, platforms: place.codes ?? [], now });
  },

  async fetchLineStatus({ signal, now }) {
    return summarizeRouteAlerts(await fetchFeed(FEEDS.alerts, signal, now, ALERTS_TTL_MS), await loadWmataBusStatic(), now);
  },

  async fetchLines() {
    return (await loadWmataBusStatic()).data.lines();
  },
};
