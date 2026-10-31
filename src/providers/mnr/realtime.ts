import type { FeedMessage } from "../gtfs/feed";
import { fetchMtaFeed } from "../mta/feed";

export type { FeedMessage };

const DEFAULT_FEED = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr";
const DEFAULT_ALERTS = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fmnr-alerts";

export function fetchRealtime(signal: AbortSignal): Promise<FeedMessage> {
  return fetchMtaFeed(process.env.MNR_REALTIME_URL || DEFAULT_FEED, signal);
}

/** Alerts are best-effort: a failure here must not take down trip data. */
export async function fetchAlerts(signal: AbortSignal): Promise<FeedMessage | undefined> {
  try {
    return await fetchMtaFeed(process.env.MNR_ALERTS_URL || DEFAULT_ALERTS, signal);
  } catch {
    return undefined;
  }
}
