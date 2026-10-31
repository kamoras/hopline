import type { Trip } from "@/domain/trip";
import { fetchGtfsRt } from "../gtfs/feed";
import { summarizeRouteAlerts } from "../gtfs/line-status";
import { buildSubwayArrivals, buildSubwayTrips, subwayPlaces } from "../gtfs/subway";
import type { FetchContext, TransitProvider } from "../types";
import { loadMtaBusStatic, MTA_BUS_ID } from "./static";

const BASE = process.env.MTA_BUSTIME_BASE || "https://gtfsrt.prod.obanyc.com";
const FEED_TTL_MS = 5_000;

/**
 * BusTime needs a free key, sent as the `key` query parameter. It is read from `MTA_BUSTIME_KEY` on the server only:
 * it is never sent to the browser, put in an error message, or written to the status page (the feed fetcher names only
 * the host when a request fails).
 */
function feedUrl(path: "tripUpdates" | "vehiclePositions" | "alerts"): string {
  const key = process.env.MTA_BUSTIME_KEY;
  if (!key) throw new Error("MTA_BUSTIME_KEY is not set (a free key from the MTA BusTime developer page)");
  return `${BASE}/${path}?key=${encodeURIComponent(key)}`;
}

const ALERTS_TTL_MS = 30_000;
const fetchFeed = (path: "tripUpdates" | "vehiclePositions" | "alerts", signal: AbortSignal, now: number, ttlMs = FEED_TTL_MS) => fetchGtfsRt(feedUrl(path), signal, { ttlMs, now });

/** The MTA's buses (Bronx, Brooklyn, Manhattan, Queens, Staten Island and MTA Bus Company) via BusTime's GTFS-Realtime feeds. */
export const mtaBusProvider: TransitProvider = {
  id: MTA_BUS_ID,
  name: "NYC Bus",
  attribution: {
    label: "MTA",
    url: "https://bustime.mta.info/wiki/Developers/Index",
    notice: "NYC bus real-time data provided by the MTA (BusTime). Hopline is not affiliated with or endorsed by the MTA.",
  },
  mode: "bus",
  regionIds: ["nyc"],

  async fetchTrips({ signal, now, diag }: FetchContext): Promise<Trip[]> {
    const [tripUpdates, vehicles] = await Promise.all([fetchFeed("tripUpdates", signal, now), fetchFeed("vehiclePositions", signal, now)]);
    return buildSubwayTrips({ operatorId: MTA_BUS_ID, mode: "bus", staticData: await loadMtaBusStatic(), tripUpdates, vehicles, now, diag });
  },

  async fetchPlaces({ region }) {
    return subwayPlaces(await loadMtaBusStatic(), region.id, "bus");
  },

  async fetchArrivals({ signal, now }, place) {
    const tripUpdates = await fetchFeed("tripUpdates", signal, now);
    return buildSubwayArrivals({ staticData: await loadMtaBusStatic(), tripUpdates, platforms: place.codes ?? [], now });
  },

  async fetchLineStatus({ signal, now }) {
    return summarizeRouteAlerts(await fetchFeed("alerts", signal, now, ALERTS_TTL_MS), await loadMtaBusStatic(), now);
  },

  async fetchLines() {
    return (await loadMtaBusStatic()).data.lines();
  },
};
