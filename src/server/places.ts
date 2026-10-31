import type { Board } from "@/domain/board";
import { mergePlaces, type Place, type PlaceOverride } from "@/domain/place";
import { providersFor } from "@/providers/registry";
import { PlaceIndex } from "./place-index";
import overrides from "../../data/places/overrides.json";

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
  const places = mergePlaces(lists.flat(), overrides as PlaceOverride[]);
  // Don't pin an empty result (probably a transient failure) for hours.
  if (places.length) cache.set(key, { places, at: now });
  return places;
}

const indexes = new Map<string, { places: Place[]; index: PlaceIndex }>();

/** The board's places as a spatial/name index, built once per places list (so lookups never scan a big network). */
export async function getPlaceIndex(board: Board, now = Date.now()): Promise<PlaceIndex> {
  const places = await getPlaces(board, now);
  const key = `${board.mode}/${board.region.id}`;
  let hit = indexes.get(key);
  if (!hit || hit.places !== places) indexes.set(key, (hit = { places, index: new PlaceIndex(places) }));
  return hit.index;
}
