import { transit_realtime as rt } from "gtfs-realtime-bindings";

export type FeedMessage = rt.FeedMessage;

/** Feeds are shared by every request on this server instance for a few seconds. */
const cache = new Map<string, { at: number; message: Promise<FeedMessage> }>();

/**
 * Fetches and decodes an MTA GTFS-Realtime feed. Sends `MTA_API_KEY` as `x-api-key` when set
 * (the feeds have been keyless, but this is where a key would go). Results are memoized per URL
 * for `ttlMs`, so several callers in the same moment cost one upstream request.
 */
export function fetchMtaFeed(url: string, signal: AbortSignal, ttlMs = 0, now = Date.now()): Promise<FeedMessage> {
  const hit = cache.get(url);
  if (ttlMs > 0 && hit && now - hit.at < ttlMs) return hit.message;

  const message = (async () => {
    const headers: Record<string, string> = {};
    if (process.env.MTA_API_KEY) headers["x-api-key"] = process.env.MTA_API_KEY;
    const res = await fetch(url, { headers, signal, cache: "no-store" });
    if (!res.ok) throw new Error(`MTA feed responded ${res.status}`);
    return rt.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
  })();
  if (ttlMs > 0) {
    cache.set(url, { at: now, message });
    message.catch(() => cache.delete(url)); // never cache a failure
  }
  return message;
}
