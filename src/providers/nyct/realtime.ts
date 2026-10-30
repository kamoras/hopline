import { fetchMtaFeed, type FeedMessage } from "../mta/feed";

const BASE = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/";

/** The subway is published as eight feeds, grouped by trunk line. */
export const SUBWAY_FEEDS = ["nyct%2Fgtfs", "nyct%2Fgtfs-ace", "nyct%2Fgtfs-bdfm", "nyct%2Fgtfs-g", "nyct%2Fgtfs-jz", "nyct%2Fgtfs-nqrw", "nyct%2Fgtfs-l", "nyct%2Fgtfs-si"];

/** The MTA's service-alert feed for the whole subway. */
export const SUBWAY_ALERTS_FEED = "camsys%2Fsubway-alerts";

/** Seconds a decoded feed may be reused, so trips and station arrivals share one upstream fetch. */
const FEED_TTL_MS = 5_000;

/**
 * Fetches every subway feed in parallel. A feed that fails is skipped (the rest still show),
 * and the count is reported so the status page can say which part of the system is missing.
 */
export async function fetchSubwayFeeds(signal: AbortSignal, now = Date.now()): Promise<{ feeds: FeedMessage[]; failed: string[] }> {
  const base = process.env.NYCT_FEED_BASE || BASE;
  const results = await Promise.allSettled(SUBWAY_FEEDS.map((f) => fetchMtaFeed(`${base}${f}`, signal, FEED_TTL_MS, now)));
  const feeds: FeedMessage[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => (r.status === "fulfilled" ? feeds.push(r.value) : failed.push(`${SUBWAY_FEEDS[i]} (${r.reason instanceof Error ? r.reason.message : "error"})`)));
  if (feeds.length === 0) throw new Error(`All subway feeds failed: ${failed.join("; ")}`);
  return { feeds, failed };
}

/** Alerts change slowly, so they are reused for 30 s. A failure propagates: line status unknown must not read as "good". */
export function fetchSubwayAlerts(signal: AbortSignal, now = Date.now()): Promise<FeedMessage> {
  const base = process.env.NYCT_FEED_BASE || BASE;
  return fetchMtaFeed(`${base}${process.env.NYCT_ALERTS_FEED || SUBWAY_ALERTS_FEED}`, signal, 30_000, now);
}
