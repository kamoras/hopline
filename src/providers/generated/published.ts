import { dataHost } from "../gtfs/dataset";

const TTL_MS = 10 * 60_000;
const RETRY_MS = 60_000;

/** Ids of providers made from the ingestion catalog (see `generatedProviders`). */
export const generatedIds = new Set<string>();

let known: { keys?: Set<string>; at: number } | undefined;
let pending = false;

async function fetchPublished(host: string): Promise<Set<string> | undefined> {
  try {
    const body =
      host.startsWith("file://")
        ? (JSON.parse(await (await import("node:fs/promises")).readFile(`${decodeURIComponent(new URL(host).pathname)}/index.json`, "utf8")) as { agencies?: { id: string }[] })
        : await fetch(`${host}/index.json`, { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? (r.json() as Promise<{ agencies?: { id: string }[] }>) : undefined));
    return body?.agencies ? new Set(body.agencies.map((a) => a.id)) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The agencies whose data the host actually has (its `index.json`), refreshed in the background every ten minutes; nothing
 * until the first answer arrives, and nothing when there is no host or it cannot be read. The report in the repository can run
 * ahead of the host (a weekly ingest drops an agency whose feed broke before the report is merged), and a board without data
 * is only an empty map.
 */
export function publishedKeys(now = Date.now()): ReadonlySet<string> | undefined {
  const host = dataHost();
  if (!host) return undefined;
  if (!pending && (!known || now - known.at > (known.keys ? TTL_MS : RETRY_MS))) {
    pending = true;
    void fetchPublished(host).then((keys) => {
      known = { keys, at: Date.now() };
      pending = false;
    });
  }
  return known?.keys;
}

/** Is this provider one to show? Hand-built ones always are; generated ones once the host is known to have their data. */
export function isServed(id: string, published = publishedKeys()): boolean {
  return !generatedIds.has(id) || !published || published.has(id);
}

/** For tests. */
export const resetPublished = () => {
  known = undefined;
  pending = false;
};
