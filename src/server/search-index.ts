import type { Mode } from "@/domain/modes";
import { normalizeName } from "@/domain/place";
import { dataHost } from "@/providers/gtfs/dataset";

/** One station in the published search index: [mode, region id, place id, name, lat, lon]. */
export type IndexedPlace = readonly [mode: Mode, regionId: string, id: string, name: string, lat: number, lon: number];

export interface PlaceSearchIndex {
  generatedAt: string;
  places: IndexedPlace[];
}

/** The stations whose name contains the query, on boards that exist, best matches (names that start with it) first. */
export function searchIndex(places: readonly IndexedPlace[], query: string, boards: ReadonlySet<string>, limit = 24): { place: IndexedPlace; rank: 0 | 2 }[] {
  const q = normalizeName(query);
  if (!q) return [];
  const out: { place: IndexedPlace; rank: 0 | 2 }[] = [];
  for (const place of places) {
    if (!boards.has(`${place[0]}/${place[1]}`)) continue;
    const name = normalizeName(place[3]);
    if (name.includes(q)) out.push({ place, rank: name.startsWith(q) ? 0 : 2 });
  }
  return out.sort((a, b) => a.rank - b.rank || a.place[3].localeCompare(b.place[3])).slice(0, limit);
}

const TTL_MS = 6 * 60 * 60_000;
let cached: { index?: PlaceSearchIndex; at: number } | undefined;

/**
 * The published index of every station of the whole-area boards (`places.json` on the data host, written by
 * `npm run data:places`), or nothing when there is no host or it does not have one yet. Kept for six hours; a failed fetch
 * is not retried for a minute.
 */
export async function loadSearchIndex(now = Date.now()): Promise<PlaceSearchIndex | undefined> {
  const host = dataHost();
  if (!host) return undefined;
  if (cached && now - cached.at < (cached.index ? TTL_MS : 60_000)) return cached.index;
  let index: PlaceSearchIndex | undefined;
  try {
    if (host.startsWith("file://")) {
      index = JSON.parse(await (await import("node:fs/promises")).readFile(`${decodeURIComponent(new URL(host).pathname)}/places.json`, "utf8")) as PlaceSearchIndex;
    } else {
      const res = await fetch(`${host}/places.json`, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) index = (await res.json()) as PlaceSearchIndex;
    }
  } catch {
    index = undefined;
  }
  cached = { index: index && Array.isArray(index.places) ? index : undefined, at: now };
  return cached.index;
}
