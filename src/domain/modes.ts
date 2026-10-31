/**
 * Transport modes and the words the UI uses for each. Adding a mode means adding
 * an entry here (and providers that emit trips with that `mode`); no component
 * hard-codes "train" or "flight".
 */
export interface ModeInfo {
  /** URL segment: /{slug}/{region}. */
  slug: string;
  /** Navigation label, plural. */
  label: string;
  noun: string;
  nounPlural: string;
  /** Prefix for the public identifier: "Train 2150", "Flight DL 412". */
  numberLabel: string;
  /** What a stop is called for this mode. */
  stopNoun: string;
  /** Whether the operator reports lateness against a timetable. If not, the UI shows no delay status. */
  reportsDelay: boolean;
  /** "trips": the board lists individual trips. "stations": riders think in stations, so it lists stations. */
  browse: "trips" | "stations";
  /** What a boarding position is called: "Track 12", "Platform 3". */
  platformNoun: string;
  searchPlaceholder: string;
  /** Shown when a search finds nothing. */
  searchHint: string;
  /** What the service-status strip lists: lines for rail and subway, airports for flights. */
  lineNoun: string;
  /**
   * A network too big to send whole (buses: thousands of stops, hundreds of routes). Its board loads trips,
   * stops and track for the part of the map being looked at, or for one chosen route.
   */
  viewport: boolean;
}

export const MODES = {
  rail: {
    slug: "rail",
    label: "Trains",
    noun: "train",
    nounPlural: "trains",
    numberLabel: "Train",
    stopNoun: "station",
    reportsDelay: true,
    browse: "trips",
    platformNoun: "Track",
    searchPlaceholder: "Station, train #, or “A to B”…",
    searchHint: "Try a train number like 2150, a station like Stamford, or a trip like “New Haven to New York round trip”.",
    lineNoun: "line",
    viewport: false,
  },
  // Rapid transit in every city, whatever it is called there (subway, the T, Metro, the L): the mode's
  // internal id stays `subway`, but riders see "Metro" and each operator keeps its own name.
  subway: {
    slug: "metro",
    label: "Metro",
    noun: "train",
    nounPlural: "trains",
    numberLabel: "Line",
    stopNoun: "station",
    reportsDelay: false,
    browse: "stations",
    platformNoun: "Platform",
    searchPlaceholder: "Station or line…",
    searchHint: "Try a station name, or a line like L or Red.",
    lineNoun: "line",
    viewport: false,
  },
  flights: {
    slug: "flights",
    label: "Flights",
    noun: "flight",
    nounPlural: "flights",
    numberLabel: "Flight",
    stopNoun: "airport",
    reportsDelay: false,
    browse: "stations",
    platformNoun: "Gate",
    searchPlaceholder: "Airport or flight…",
    searchHint: "Try an airport like JFK or Bradley, or a flight like DAL1283.",
    lineNoun: "airport",
    viewport: false,
  },
  bus: {
    slug: "bus",
    label: "Buses",
    noun: "bus",
    nounPlural: "buses",
    numberLabel: "Route",
    stopNoun: "stop",
    reportsDelay: false,
    browse: "stations",
    platformNoun: "Stop",
    searchPlaceholder: "Stop or route (1, SL1)…",
    searchHint: "Try a stop like Harvard Square, or a route number like 1 or 39.",
    lineNoun: "route",
    viewport: true,
  },
} as const satisfies Record<string, ModeInfo>;

export type Mode = keyof typeof MODES;

/** A mode from its URL slug or its internal id (so old `/subway/...` links still resolve). */
export function getMode(slugOrId: string): Mode | undefined {
  return (Object.keys(MODES) as Mode[]).find((m) => MODES[m].slug === slugOrId || m === slugOrId);
}
