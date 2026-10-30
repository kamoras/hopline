import { transit_realtime as rt } from "gtfs-realtime-bindings";

const DEFAULT_FEED = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr";
const DEFAULT_ALERTS = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fmnr-alerts";

export type FeedMessage = rt.FeedMessage;

async function fetchFeed(url: string, signal: AbortSignal): Promise<FeedMessage> {
  const headers: Record<string, string> = {};
  if (process.env.MTA_API_KEY) headers["x-api-key"] = process.env.MTA_API_KEY;
  const res = await fetch(url, { headers, signal, cache: "no-store" });
  if (!res.ok) throw new Error(`MTA feed responded ${res.status}`);
  return rt.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
}

export function fetchRealtime(signal: AbortSignal): Promise<FeedMessage> {
  return fetchFeed(process.env.MNR_REALTIME_URL || DEFAULT_FEED, signal);
}

/** Alerts are best-effort: a failure here must not take down trip data. */
export async function fetchAlerts(signal: AbortSignal): Promise<FeedMessage | undefined> {
  try {
    return await fetchFeed(process.env.MNR_ALERTS_URL || DEFAULT_ALERTS, signal);
  } catch {
    return undefined;
  }
}
