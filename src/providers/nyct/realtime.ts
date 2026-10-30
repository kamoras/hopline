import { fetchMtaFeed, type FeedMessage } from "../mta/feed";

const BASE = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/";

/** The subway is published as eight feeds, grouped by trunk line. */
export const SUBWAY_FEEDS = ["nyct%2Fgtfs", "nyct%2Fgtfs-ace", "nyct%2Fgtfs-bdfm", "nyct%2Fgtfs-g", "nyct%2Fgtfs-jz", "nyct%2Fgtfs-nqrw", "nyct%2Fgtfs-l", "nyct%2Fgtfs-si"];

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
