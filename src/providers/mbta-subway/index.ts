import type { Trip } from "@/domain/trip";
import { fetchGtfsRt } from "../gtfs/feed";
import { summarizeLineStatus } from "../gtfs/line-status";
import { subwayPlaces } from "../gtfs/subway";
import type { FetchContext, TransitProvider } from "../types";
import { buildMbtaSubwayArrivals, buildMbtaSubwayTrips } from "./normalize";
import { loadMbtaSubwayStatic, MBTA_SUBWAY_ID } from "./static";

const FEEDS = {
  trips: process.env.MBTA_TRIP_UPDATES_URL || "https://cdn.mbta.com/realtime/TripUpdates.pb",
  vehicles: process.env.MBTA_VEHICLE_POSITIONS_URL || "https://cdn.mbta.com/realtime/VehiclePositions.pb",
  alerts: process.env.MBTA_ALERTS_URL || "https://cdn.mbta.com/realtime/Alerts.pb",
};

/** Seconds a decoded feed may be reused, so trips and station arrivals share one upstream fetch. */
const FEED_TTL_MS = 5_000;
const ALERTS_TTL_MS = 30_000;

/** The lines riders know, in the order the T lists them. */
const LINE_ORDER = ["RL", "OL", "BL", "B", "C", "D", "E", "M"];

/** Sent as `x-api-key` when set: optional, but raises the MBTA's rate limit. */
const headers = (): Record<string, string> => (process.env.MBTA_API_KEY ? { "x-api-key": process.env.MBTA_API_KEY } : {});

/** The MBTA shares one feed across every mode; callers filter to the subway's routes. */
const fetchFeed = (url: string, signal: AbortSignal, now: number, ttlMs = FEED_TTL_MS) => fetchGtfsRt(url, signal, { headers: headers(), ttlMs, now });

/** The Boston subway (Red, Orange, Blue, Green and Mattapan) via the MBTA's GTFS-Realtime feeds. */
export const mbtaSubwayProvider: TransitProvider = {
  id: MBTA_SUBWAY_ID,
  name: "MBTA Subway",
  attribution: {
    label: "MBTA",
    url: "https://www.mbta.com/developers",
    notice: "MBTA real-time data provided by the Massachusetts Bay Transportation Authority. Hopline is not affiliated with or endorsed by the MBTA.",
  },
  mode: "subway",
  regionIds: ["boston"],

  async fetchTrips({ signal, now, diag }: FetchContext): Promise<Trip[]> {
    const [tripUpdates, vehicles] = await Promise.all([fetchFeed(FEEDS.trips, signal, now), fetchFeed(FEEDS.vehicles, signal, now)]);
    return buildMbtaSubwayTrips({ staticData: await loadMbtaSubwayStatic(), tripUpdates, vehicles, now, diag });
  },

  async fetchPlaces({ region }) {
    return subwayPlaces(await loadMbtaSubwayStatic(), region.id);
  },

  async fetchArrivals({ signal, now }, place) {
    const tripUpdates = await fetchFeed(FEEDS.trips, signal, now);
    return buildMbtaSubwayArrivals({ staticData: await loadMbtaSubwayStatic(), tripUpdates, platforms: place.codes ?? [], now });
  },

  async fetchLineStatus({ signal, now }) {
    const { lines } = await loadMbtaSubwayStatic();
    const style = new Map(Object.values(lines).map((l) => [l.short, { color: l.color, text: "#FFFFFF" }]));
    const feed = await fetchFeed(FEEDS.alerts, signal, now, ALERTS_TTL_MS); // a failure means status is unknown, not good
    return summarizeLineStatus({ feed, now, order: LINE_ORDER, lineOf: (routeId) => lines[routeId]?.short, style });
  },

  async fetchLines() {
    return (await loadMbtaSubwayStatic()).data.lines();
  },
};
