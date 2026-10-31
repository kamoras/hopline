import { normalizeName, type Place } from "@/domain/place";
import { distanceMiles, type LatLon } from "@/lib/geo";
import { inBBox, type BBox } from "@/lib/bbox";

/** Grid cell size in degrees (about 1 km): small enough that a viewport reads few cells. */
const CELL_DEG = 0.01;
const cellKey = (x: number, y: number) => x * 100_000 + y;

/**
 * A board's places for queries by area, by distance, by name and by id, so a big network (a bus system's
 * thousands of stops) is never sent whole to a browser. Built once per board and shared by every request.
 */
export class PlaceIndex {
  private readonly cells = new Map<number, Place[]>();
  private readonly byId = new Map<string, Place>();
  private readonly names: { place: Place; name: string }[];

  constructor(readonly places: readonly Place[]) {
    for (const p of places) {
      this.byId.set(p.id, p);
      const key = cellKey(Math.floor(p.lon / CELL_DEG), Math.floor(p.lat / CELL_DEG));
      const cell = this.cells.get(key);
      if (cell) cell.push(p);
      else this.cells.set(key, [p]);
    }
    this.names = places.map((place) => ({ place, name: normalizeName(place.name) }));
  }

  get(id: string): Place | undefined {
    return this.byId.get(id);
  }

  /** Places inside the rectangle (at most `limit`, nearest the middle first when there are too many). */
  inBox(box: BBox, limit: number): Place[] {
    const [w, s, e, n] = box;
    const found: Place[] = [];
    for (let x = Math.floor(w / CELL_DEG); x <= Math.floor(e / CELL_DEG); x++) {
      for (let y = Math.floor(s / CELL_DEG); y <= Math.floor(n / CELL_DEG); y++) {
        for (const p of this.cells.get(cellKey(x, y)) ?? []) if (inBBox(box, p.lat, p.lon)) found.push(p);
      }
    }
    if (found.length <= limit) return found;
    const mid = { lat: (s + n) / 2, lon: (w + e) / 2 };
    return found.sort((a, b) => distanceMiles(a, mid) - distanceMiles(b, mid)).slice(0, limit);
  }

  /** The closest places to a point, searching outward ring by ring until enough are found. */
  near(at: LatLon, count: number, maxRings = 12): Place[] {
    const [cx, cy] = [Math.floor(at.lon / CELL_DEG), Math.floor(at.lat / CELL_DEG)];
    let found: Place[] = [];
    for (let ring = 0; ring <= maxRings; ring++) {
      found = [];
      for (let x = cx - ring; x <= cx + ring; x++) {
        for (let y = cy - ring; y <= cy + ring; y++) found.push(...(this.cells.get(cellKey(x, y)) ?? []));
      }
      // Everything within `ring` cells is at most `ring * cell` away at best; once we have enough inside that, stop.
      if (found.length >= count && ring >= 1) break;
    }
    return found.sort((a, b) => distanceMiles(a, at) - distanceMiles(b, at)).slice(0, count);
  }

  /** Places whose name contains the query, names that start with it first. */
  search(query: string, limit: number): Place[] {
    const q = normalizeName(query);
    if (!q) return [];
    return this.names
      .filter(({ name }) => name.includes(q))
      .sort((a, b) => Number(!a.name.startsWith(q)) - Number(!b.name.startsWith(q)) || a.place.name.localeCompare(b.place.name))
      .slice(0, limit)
      .map(({ place }) => place);
  }
}
