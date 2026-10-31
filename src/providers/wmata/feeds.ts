import { fetchGtfsRt } from "../gtfs/feed";

/** WMATA's GTFS and GTFS-Realtime endpoints (Metrorail and Metrobus share the host and the key). */
export const WMATA_BASE = process.env.WMATA_GTFS_BASE || "https://api.wmata.com/gtfs";

/** Seconds a decoded feed may be reused, so trips and arrivals share one upstream fetch. */
export const FEED_TTL_MS = 5_000;

/** WMATA requires a key, sent as `api_key`. It is read on the server only and never sent to the browser or logged. */
const headers = (): Record<string, string> => (process.env.WMATA_API_KEY ? { api_key: process.env.WMATA_API_KEY } : {});

export const fetchWmataFeed = (url: string, signal: AbortSignal, now: number, ttlMs = FEED_TTL_MS) => fetchGtfsRt(url, signal, { headers: headers(), ttlMs, now });
