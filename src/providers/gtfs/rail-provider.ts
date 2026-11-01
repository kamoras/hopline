import type { Attribution, Trip } from "@/domain/trip";
import type { FetchContext, TransitProvider } from "../types";
import { indexAlerts } from "./alerts";
import { fetchGtfsRt, type FeedMessage } from "./feed";
import { buildRealtimeTrips, type RealtimeConfig } from "./realtime";
import { staticLinesAndPlaces } from "./scheduled";
import type { GtfsStaticData } from "./static";

export interface RealtimeRailProviderConfig {
  realtime: RealtimeConfig;
  attribution: Attribution;
  regionIds: readonly string[];
  /** Loads the bundled schedule on first use (see `lazyStaticData`). */
  staticData(): Promise<GtfsStaticData>;
  /** Trip updates and vehicle positions are usually separate GTFS-RT feeds (leave `vehicles` out when one feed carries both, as the LIRR's does); alerts are optional. */
  feeds: { tripUpdates: string; vehicles?: string; alerts?: string };
  /** An optional key an operator accepts for a higher rate limit, sent in `header`. */
  apiKey?: { value: string | undefined; header: string };
}

const FEED_TTL_MS = 5_000;
const ALERTS_TTL_MS = 30_000;

/**
 * A railroad whose live data is two GTFS-Realtime feeds over a bundled schedule (MBTA Commuter Rail, MARC,
 * VRE). The feeds are merged into one, so the shared trip builder sees what Metro-North's single feed gives.
 * Feeds that carry other operators' or modes' entities are filtered to this schedule's routes.
 */
export function createRealtimeRailProvider({ realtime, attribution, regionIds, staticData, feeds, apiKey }: RealtimeRailProviderConfig): TransitProvider {
  const headers = (): Record<string, string> => (apiKey?.value ? { [apiKey.header]: apiKey.value } : {});

  async function fetchMerged(signal: AbortSignal, data: GtfsStaticData): Promise<FeedMessage> {
    const [tripUpdates, vehicles] = await Promise.all([
      fetchGtfsRt(feeds.tripUpdates, signal, { headers: headers(), ttlMs: FEED_TTL_MS }),
      feeds.vehicles ? fetchGtfsRt(feeds.vehicles, signal, { headers: headers(), ttlMs: FEED_TTL_MS }) : undefined,
    ]);
    const ours = (e: FeedMessage["entity"][number]) => !!data.routes[e.tripUpdate?.trip.routeId ?? e.vehicle?.trip?.routeId ?? ""];
    return { ...tripUpdates, entity: [...tripUpdates.entity, ...(vehicles?.entity ?? [])].filter(ours) } as FeedMessage;
  }

  return {
    id: realtime.id,
    name: realtime.name,
    attribution,
    mode: "rail",
    regionIds,

    async fetchTrips({ region, signal, now, diag }: FetchContext): Promise<Trip[]> {
      const data = await staticData();
      const [feed, alertFeed] = await Promise.all([
        fetchMerged(signal, data),
        feeds.alerts ? fetchGtfsRt(feeds.alerts, signal, { headers: headers(), ttlMs: ALERTS_TTL_MS }).catch(() => undefined) : undefined,
      ]);
      return buildRealtimeTrips({ config: realtime, staticData: data, realtime: feed, alerts: indexAlerts(alertFeed, now), region, now, diag });
    },

    ...staticLinesAndPlaces(staticData),
  };
}
