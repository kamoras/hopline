import { fetchGtfsRt, type FeedMessage } from "../gtfs/feed";

export type { FeedMessage };

/**
 * Fetches an MTA GTFS-Realtime feed. Sends `MTA_API_KEY` as `x-api-key` when set (the feeds have been
 * keyless, but this is where a key would go).
 */
export function fetchMtaFeed(url: string, signal: AbortSignal, ttlMs = 0, now = Date.now()): Promise<FeedMessage> {
  const headers: Record<string, string> = {};
  if (process.env.MTA_API_KEY) headers["x-api-key"] = process.env.MTA_API_KEY;
  return fetchGtfsRt(url, signal, { headers, ttlMs, now });
}
