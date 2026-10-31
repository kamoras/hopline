/** A map rectangle: [west, south, east, north] in degrees. */
export type BBox = readonly [number, number, number, number];

/** The largest area a viewport query may cover (degrees on a side); anything bigger is not a viewport. */
export const MAX_BBOX_SPAN_DEG = 4;

/** "w,s,e,n" as sent by the browser, or nothing if it is not a sensible rectangle. */
export function parseBbox(raw: string | null | undefined): BBox | undefined {
  const parts = (raw ?? "").split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined;
  const [w, s, e, n] = parts as [number, number, number, number];
  if (e <= w || n <= s || e - w > MAX_BBOX_SPAN_DEG || n - s > MAX_BBOX_SPAN_DEG) return undefined;
  if (s < -90 || n > 90 || w < -180 || e > 180) return undefined;
  return [w, s, e, n];
}

export const inBBox = ([w, s, e, n]: BBox, lat: number, lon: number) => lon >= w && lon <= e && lat >= s && lat <= n;

/**
 * Rounds a rectangle outward to a grid, so the many slightly different views of a pan share a few cacheable
 * requests (and the edges come with a margin).
 */
export function snapBbox([w, s, e, n]: BBox, stepDeg = 0.02): BBox {
  const down = (v: number) => Math.floor(v / stepDeg) * stepDeg;
  const up = (v: number) => Math.ceil(v / stepDeg) * stepDeg;
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  return [r(down(w)), r(down(s)), r(up(e)), r(up(n))];
}

export const formatBbox = (b: BBox) => b.join(",");
