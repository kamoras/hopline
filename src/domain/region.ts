export interface Region {
  id: string;
  name: string;
  /** [west, south, east, north] in degrees. */
  bounds: [number, number, number, number];
  center: [lon: number, lat: number];
  zoom: number;
  /** IANA zone used to display times to everyone looking at this region. */
  timeZone: string;
}

export const NORTHEAST: Region = {
  id: "northeast",
  name: "NYC · Connecticut · Philadelphia",
  bounds: [-75.9, 39.7, -71.6, 42.2],
  center: [-73.9, 40.9],
  zoom: 7.2,
  timeZone: "America/New_York",
};

/** Add new regions here; providers declare which ids they can serve. */
export const REGIONS: readonly Region[] = [NORTHEAST];

export function getRegion(id: string | null | undefined): Region | undefined {
  return REGIONS.find((r) => r.id === id);
}

export function inBounds(region: Region, lat: number, lon: number): boolean {
  const [w, s, e, n] = region.bounds;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}
