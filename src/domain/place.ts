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
  /** Operator station codes that map to this place (e.g. Amtrak "NYP"). */
  codes?: string[];
}

/**
 * A hand-verified position that beats whatever an operator's feed says. Providers' own
 * coordinates are often rough (a city centroid, a ticket office); each entry here names its source.
 */
export interface PlaceOverride {
  /** Match by place id (slug), by operator code, or both. */
  ids?: string[];
  codes?: string[];
  lat: number;
  lon: number;
  source: string;
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
export function mergePlaces(places: readonly Omit<Place, "id">[], overrides: readonly PlaceOverride[] = []): Place[] {
  const byId = new Map<string, Place>();
  for (const p of places) {
    const id = placeSlug(p.name.replace(/\s+(station|terminal)$/i, ""));
    if (!id) continue;
    const existing = byId.get(id);
    if (existing) {
      // Same station from another operator: keep the first position, but remember its codes.
      existing.codes = [...new Set([...(existing.codes ?? []), ...(p.codes ?? [])])];
    } else {
      byId.set(id, { ...p, id });
    }
  }
  const merged = [...byId.values()].map((place) => {
    const fix = overrides.find((o) => o.ids?.includes(place.id) || o.codes?.some((c) => place.codes?.includes(c)));
    return fix ? { ...place, lat: fix.lat, lon: fix.lon } : place;
  });
  return merged.sort((a, b) => a.name.localeCompare(b.name));
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
