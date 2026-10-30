import { distanceMiles, type LatLon } from "@/lib/geo";
import type { Mode } from "./modes";

/** A station, airport or stop people think in terms of. Ids are URL-safe slugs. */
export interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
  mode: Mode;
  regionId: string;
}

/** Lowercase alphanumerics, so "St. Louis" and "st louis" compare equal. */
export const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const placeSlug = (name: string) => normalizeName(name).replace(/ /g, "-");

/**
 * Operators name the same station differently ("Stamford" vs "Stamford Station"),
 * so places are merged by normalized name. The first one wins.
 */
export function mergePlaces(places: readonly Omit<Place, "id">[]): Place[] {
  const byId = new Map<string, Place>();
  for (const p of places) {
    const id = placeSlug(p.name.replace(/\s+(station|terminal)$/i, ""));
    if (id && !byId.has(id)) byId.set(id, { ...p, id });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface NearbyPlace {
  place: Place;
  miles: number;
}

export function nearestPlaces(places: readonly Place[], at: LatLon, limit = 3): NearbyPlace[] {
  return places
    .map((place) => ({ place, miles: distanceMiles(at, place) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, limit);
}
