import type { Trip } from "@/domain/trip";
import { summarizeLineStatus } from "../gtfs/line-status";
import { buildSubwayArrivals, buildSubwayTrips, subwayPlaces } from "../gtfs/subway";
import type { FetchContext, TransitProvider } from "../types";
import { fetchWmataFeed as fetchFeed, WMATA_BASE as BASE } from "./feeds";
import { loadWmataStatic, WMATA_ID } from "./static";

const FEEDS = {
  trips: process.env.WMATA_TRIP_UPDATES_URL || `${BASE}/rail-gtfsrt-tripupdates.pb`,
  vehicles: process.env.WMATA_VEHICLE_POSITIONS_URL || `${BASE}/rail-gtfsrt-vehiclepositions.pb`,
  alerts: process.env.WMATA_ALERTS_URL || `${BASE}/rail-gtfsrt-alerts.pb`,
};

const ALERTS_TTL_MS = 30_000;

/** The lines riders know, in the order WMATA lists them. */
const LINE_ORDER = ["RD", "OR", "SV", "BL", "YL", "GR"];

/** Washington's Metrorail (Red, Orange, Silver, Blue, Yellow and Green) via WMATA's GTFS-Realtime feeds. */
export const wmataProvider: TransitProvider = {
  id: WMATA_ID,
  name: "Washington Metro",
  attribution: {
    label: "WMATA",
    url: "https://developer.wmata.com",
    notice: "Metrorail real-time data provided by the Washington Metropolitan Area Transit Authority (WMATA). Hopline is not affiliated with or endorsed by WMATA.",
  },
  mode: "subway",
  regionIds: ["washington"],

  async fetchTrips({ signal, now, diag }: FetchContext): Promise<Trip[]> {
    const [tripUpdates, vehicles] = await Promise.all([fetchFeed(FEEDS.trips, signal, now), fetchFeed(FEEDS.vehicles, signal, now)]);
    return buildSubwayTrips({ operatorId: WMATA_ID, staticData: await loadWmataStatic(), tripUpdates, vehicles, now, diag });
  },

  async fetchPlaces({ region }) {
    return subwayPlaces(await loadWmataStatic(), region.id);
  },

  async fetchArrivals({ signal, now }, place) {
    const tripUpdates = await fetchFeed(FEEDS.trips, signal, now);
    return buildSubwayArrivals({ staticData: await loadWmataStatic(), tripUpdates, platforms: place.codes ?? [], now });
  },

  async fetchLineStatus({ signal, now }) {
    const { lines } = await loadWmataStatic();
    const style = new Map(Object.values(lines).map((l) => [l.short, { color: l.color, text: l.text ?? "#FFFFFF" }]));
    const feed = await fetchFeed(FEEDS.alerts, signal, now, ALERTS_TTL_MS); // a failure means status is unknown, not good
    return summarizeLineStatus({ feed, now, order: LINE_ORDER, lineOf: (routeId) => lines[routeId]?.short, style });
  },

  async fetchLines() {
    return (await loadWmataStatic()).data.lines();
  },
};
