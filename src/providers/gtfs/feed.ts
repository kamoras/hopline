import { transit_realtime as rt } from "gtfs-realtime-bindings";

export type FeedMessage = rt.FeedMessage;

/** Feeds are shared by every request on this server instance for a few seconds. */
const cache = new Map<string, { at: number; message: Promise<FeedMessage> }>();

/**
 * Fetches and decodes a GTFS-Realtime feed. Results are memoized per URL for `ttlMs`, so several
 * callers in the same moment cost one upstream request. `headers` carries an operator's API key.
 */
export function fetchGtfsRt(
  url: string,
  signal: AbortSignal,
  { headers = {}, ttlMs = 0, now = Date.now() }: { headers?: Record<string, string>; ttlMs?: number; now?: number } = {},
): Promise<FeedMessage> {
  const hit = cache.get(url);
  if (ttlMs > 0 && hit && now - hit.at < ttlMs) return hit.message;

  const message = (async () => {
    const res = await fetch(url, { headers, signal, cache: "no-store" });
    if (!res.ok) throw new Error(`Feed ${new URL(url).host} responded ${res.status}`);
    return rt.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
  })();
  if (ttlMs > 0) {
    cache.set(url, { at: now, message });
    message.catch(() => cache.delete(url)); // never cache a failure
  }
  return message;
}
