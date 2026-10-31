export interface Region {
  id: string;
  name: string;
  /** [west, south, east, north] in degrees. */
  bounds: [number, number, number, number];
  center: [lon: number, lat: number];
  zoom: number;
  /** IANA zone used to display times to everyone looking at this region. */
  timeZone: string;
  /** What people call places here, mapped to station-name fragments (normalized). */
  aliases?: Record<string, string[]>;
}

export const NORTHEAST: Region = {
  id: "northeast",
  name: "Philadelphia · NYC · Boston",
  bounds: [-75.9, 39.7, -70.5, 42.9],
  center: [-73.0, 41.3],
  zoom: 6.6,
  timeZone: "America/New_York",
  aliases: {
    "new york": ["grand central", "new york penn"],
    "new york city": ["grand central", "new york penn"],
    nyc: ["grand central", "new york penn"],
    manhattan: ["grand central", "new york penn"],
    midtown: ["grand central", "new york penn"],
    gct: ["grand central"],
    "grand central terminal": ["grand central"],
    penn: ["new york penn"],
    "penn station": ["new york penn"],
    nyp: ["new york penn"],
    philly: ["philadelphia"],
    "30th street": ["philadelphia"],
    boston: ["boston south", "boston north", "boston back bay"],
    "south station": ["boston south"],
    "north station": ["boston north"],
    "back bay": ["boston back bay"],
  },
};

export const NYC: Region = {
  id: "nyc",
  name: "New York City",
  bounds: [-74.3, 40.48, -73.65, 40.93],
  center: [-73.97, 40.72],
  zoom: 10.2,
  timeZone: "America/New_York",
};

/** Add new regions here; providers declare which ids they can serve. */
export const REGIONS: readonly Region[] = [NORTHEAST, NYC];

export function getRegion(id: string | null | undefined): Region | undefined {
  return REGIONS.find((r) => r.id === id);
}

export function inBounds(region: Region, lat: number, lon: number): boolean {
  const [w, s, e, n] = region.bounds;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

/** The parts of a [lon, lat] path that lie inside the region (a path can leave and re-enter it). */
export function clipToRegion(region: Region, coords: readonly [number, number][]): [number, number][][] {
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  for (const point of coords) {
    if (inBounds(region, point[1], point[0])) run.push(point);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length >= 2);
}
