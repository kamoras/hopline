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
  name: "Norfolk · Washington · NYC · Boston",
  bounds: [-79.2, 36.7, -70.5, 42.9],
  center: [-75.8, 39.9],
  zoom: 5.6,
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
    washington: ["washington union"],
    dc: ["washington union"],
    "union station": ["washington union"],
    baltimore: ["baltimore penn", "baltimore airport"],
    bwi: ["baltimore airport"],
    richmond: ["richmond main street", "richmond staples mill road"],
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

export const BOSTON: Region = {
  id: "boston",
  name: "Boston",
  bounds: [-71.5, 42.12, -70.8, 42.65],
  center: [-71.08, 42.34],
  zoom: 10.8,
  timeZone: "America/New_York",
};

export const WASHINGTON: Region = {
  id: "washington",
  name: "Washington",
  bounds: [-77.55, 38.65, -76.65, 39.2],
  center: [-77.03, 38.92],
  zoom: 9.6,
  timeZone: "America/New_York",
};

export const PHILADELPHIA: Region = {
  id: "philadelphia",
  name: "Philadelphia",
  bounds: [-75.95, 39.7, -74.65, 40.45],
  center: [-75.2, 40.0],
  zoom: 9.6,
  timeZone: "America/New_York",
};

export const CONNECTICUT: Region = {
  id: "connecticut",
  name: "Connecticut",
  bounds: [-73.75, 40.95, -71.75, 42.1],
  center: [-72.7, 41.6],
  zoom: 8.4,
  timeZone: "America/New_York",
};

export const PORTLAND_ME: Region = {
  id: "portland-me",
  name: "Portland, Maine",
  bounds: [-70.55, 43.45, -69.95, 43.95],
  center: [-70.26, 43.66],
  zoom: 10.4,
  timeZone: "America/New_York",
};

export const PITTSBURGH: Region = {
  id: "pittsburgh",
  name: "Pittsburgh",
  bounds: [-80.45, 40.2, -79.6, 40.7],
  center: [-79.99, 40.44],
  zoom: 10,
  timeZone: "America/New_York",
};

export const ALLENTOWN: Region = {
  id: "allentown",
  name: "Allentown · Lehigh Valley",
  bounds: [-75.8, 40.45, -75.1, 40.85],
  center: [-75.45, 40.62],
  zoom: 10,
  timeZone: "America/New_York",
};

export const READING: Region = {
  id: "reading",
  name: "Reading",
  bounds: [-76.2, 40.2, -75.65, 40.5],
  center: [-75.93, 40.34],
  zoom: 10.6,
  timeZone: "America/New_York",
};

export const LANCASTER: Region = {
  id: "lancaster",
  name: "Lancaster",
  bounds: [-76.6, 39.9, -76.0, 40.3],
  center: [-76.3, 40.04],
  zoom: 10.4,
  timeZone: "America/New_York",
};

export const YORK: Region = {
  id: "york",
  name: "York · Adams",
  bounds: [-77.2, 39.75, -76.55, 40.15],
  center: [-76.73, 39.96],
  zoom: 10.2,
  timeZone: "America/New_York",
};

/** The airports of the whole Northeast, Maine to Virginia and Pittsburgh (a flights board covers the sky above them). */
export const NORTHEAST_AIR: Region = {
  id: "northeast-air",
  name: "Northeast airports",
  bounds: [-81.0, 36.5, -67.0, 47.0],
  center: [-74.5, 41.5],
  zoom: 5.4,
  timeZone: "America/New_York",
};

/** Add new regions here; providers declare which ids they can serve. */
export const REGIONS: readonly Region[] = [NORTHEAST, NYC, BOSTON, WASHINGTON, PHILADELPHIA, CONNECTICUT, PORTLAND_ME, PITTSBURGH, ALLENTOWN, READING, LANCASTER, YORK, NORTHEAST_AIR];

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
