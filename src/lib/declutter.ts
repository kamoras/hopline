/** A map marker that may be hidden when too many crowd together. */
export interface Declutterable {
  id: string;
  lat: number;
  lon: number;
  /** Higher stays on screen longer when zoomed out (an interchange outranks a local stop). */
  importance: number;
}

/** Zoom levels the thinning is worked out for. Below the lowest only the very top are kept; above the highest everything shows. */
export const DETAIL_MIN_ZOOM = 6;
export const DETAIL_MAX_ZOOM = 15;
/** Markers closer than this (in screen pixels) are not both shown. */
export const MIN_SPACING_PX = 20;

/** Position on the world map at zoom 0 (512 px tiles, as MapLibre uses): a screen distance at zoom z is this distance times 2^z. */
function project(lat: number, lon: number): [number, number] {
  const x = ((lon + 180) / 360) * 512;
  const sin = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 512;
  return [x, y];
}

/**
 * For each marker, the lowest zoom at which it is shown. Markers are taken most important first, and each one
 * appears at the first zoom where no more important marker already on screen is within `spacingPx` of it, so
 * zoomed out you see the interchanges and termini, and zooming in fills the gaps in. A marker never disappears
 * as you zoom in (it keeps showing from its zoom upward), ties break by id so the result is the same every time.
 */
export function assignDetailZoom(points: readonly Declutterable[], spacingPx = MIN_SPACING_PX, zMin = DETAIL_MIN_ZOOM, zMax = DETAIL_MAX_ZOOM): Map<string, number> {
  const levels = zMax - zMin + 1;
  // One hash per zoom of the markers already visible at that zoom, in cells as wide as the spacing is there.
  const cell = (z: number) => spacingPx / 2 ** z;
  const hashes: Map<string, [number, number][]>[] = Array.from({ length: levels }, () => new Map());
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell(z))},${Math.floor(y / cell(z))}`;

  const ordered = [...points].sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id));
  const result = new Map<string, number>();
  for (const p of ordered) {
    const [x, y] = project(p.lat, p.lon);
    // A station is shown from zoom `at` upward, so it must clear its neighbors at `at` and at every deeper zoom
    // too (a more important neighbor that only appears later must not land on top of it): `at` is one past the
    // deepest zoom where it is still crowded.
    let deepestCrowded = zMin - 1;
    for (let z = zMin; z < zMax; z++) {
      const spacing = cell(z);
      const [cx, cy] = [Math.floor(x / spacing), Math.floor(y / spacing)];
      let crowded = false;
      for (let dx = -1; dx <= 1 && !crowded; dx++) {
        for (let dy = -1; dy <= 1 && !crowded; dy++) {
          for (const [ox, oy] of hashes[z - zMin]!.get(`${cx + dx},${cy + dy}`) ?? []) {
            if (Math.hypot(ox - x, oy - y) < spacing) {
              crowded = true;
              break;
            }
          }
        }
      }
      if (crowded) deepestCrowded = z;
    }
    const at = Math.min(zMax, deepestCrowded + 1);
    result.set(p.id, at);
    // Visible from `at` upward, so it keeps its place among the neighbors of every deeper zoom.
    for (let z = at; z <= zMax; z++) {
      const k = key(x, y, z);
      const list = hashes[z - zMin]!.get(k);
      if (list) list.push([x, y]);
      else hashes[z - zMin]!.set(k, [[x, y]]);
    }
  }
  return result;
}
