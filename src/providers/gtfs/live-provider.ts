import type { Attribution, Trip } from "@/domain/trip";
import type { Mode } from "@/domain/modes";
import { fetchGtfsRt } from "./feed";
import { summarizeRouteAlerts } from "./line-status";
import { buildSubwayArrivals, buildSubwayTrips, createSubwayStatic, subwayPlaces, type SubwayStatic } from "./subway";
import type { FetchContext, TransitProvider } from "../types";
import { lazy, lazyStaticData, type DataFiles } from "./dataset";

const FEED_TTL_MS = 5_000;
const ALERTS_TTL_MS = 30_000;

export interface LiveProviderConfig {
  id: string;
  name: string;
  mode: Mode;
  regionIds: readonly string[];
  attribution: Attribution;
  /** This agency's bundled data (each agency passes its own literal dynamic import). */
  files: DataFiles;
  /** Stations are grouped by name (a metro or ferry landing) or kept one per stop (buses). */
  placeIds: "name" | "stop";
  feeds: { tripUpdates: string; vehicles: string; alerts?: string };
  /** Extra request headers (an optional API key), read when a request is made so a secret is never captured at startup. */
  headers?(): Record<string, string>;
}

/**
 * An operator whose trips are entirely live: GPS positions from one feed, upcoming stops from another, over bundled
 * stations and track. A station-first board (a landing, a stop) with arrivals, and route alerts when a feed is given.
 * Each agency is a few lines of config; nothing here is specific to a mode.
 */
export function createLiveProvider({ id, name, mode, regionIds, attribution, files, placeIds, feeds, headers }: LiveProviderConfig): TransitProvider {
  const data = lazyStaticData(files, { id, name });
  const loadStatic = lazy<SubwayStatic>(async () => createSubwayStatic(await data(), placeIds));
  const fetchFeed = (url: string, signal: AbortSignal, now: number, ttlMs = FEED_TTL_MS) => fetchGtfsRt(url, signal, { headers: headers?.() ?? {}, ttlMs, now });

  return {
    id,
    name,
    attribution,
    mode,
    regionIds,

    async fetchTrips({ signal, now, diag }: FetchContext): Promise<Trip[]> {
      const [tripUpdates, vehicles] = await Promise.all([fetchFeed(feeds.tripUpdates, signal, now), fetchFeed(feeds.vehicles, signal, now)]);
      return buildSubwayTrips({ operatorId: id, mode, staticData: await loadStatic(), tripUpdates, vehicles, now, diag });
    },

    async fetchPlaces({ region }) {
      return subwayPlaces(await loadStatic(), region.id, mode);
    },

    async fetchArrivals({ signal, now }, place) {
      const tripUpdates = await fetchFeed(feeds.tripUpdates, signal, now);
      return buildSubwayArrivals({ staticData: await loadStatic(), tripUpdates, platforms: place.codes ?? [], now });
    },

    ...(feeds.alerts
      ? {
          async fetchLineStatus({ signal, now }: FetchContext) {
            const alertFeed = feeds.alerts!;
            return summarizeRouteAlerts(await fetchFeed(alertFeed, signal, now, ALERTS_TTL_MS), await loadStatic(), now);
          },
        }
      : {}),

    async fetchLines() {
      return (await loadStatic()).data.lines();
    },
  };
}
