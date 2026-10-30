import type { Board } from "@/domain/board";
import { mergePlaces, type Place } from "@/domain/place";
import { providersFor } from "@/providers/registry";

/** Stations barely change, so cache generously per server instance. */
const TTL_MS = 6 * 60 * 60_000;
const cache = new Map<string, { places: Place[]; at: number }>();

/** Places for a board, merged across operators. A failing provider just contributes none. */
export async function getPlaces(board: Board, now = Date.now()): Promise<Place[]> {
  const key = `${board.mode}/${board.region.id}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.places;

  const lists = await Promise.all(
    providersFor(board).map((p) =>
      p.fetchPlaces({ region: board.region, now, diag: {}, signal: AbortSignal.timeout(8_000) }).catch(() => []),
    ),
  );
  const places = mergePlaces(lists.flat());
  // Don't pin an empty result (probably a transient failure) for hours.
  if (places.length) cache.set(key, { places, at: now });
  return places;
}
