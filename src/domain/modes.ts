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
  },
  subway: {
    slug: "subway",
    label: "Subway",
    noun: "train",
    nounPlural: "trains",
    numberLabel: "Line",
    stopNoun: "station",
    reportsDelay: false,
    browse: "stations",
    platformNoun: "Platform",
    searchPlaceholder: "Station or line…",
    searchHint: "Try a station name, or a line like L or Red.",
  },
} as const satisfies Record<string, ModeInfo>;

export type Mode = keyof typeof MODES;

export function getMode(slug: string): Mode | undefined {
  return (Object.keys(MODES) as Mode[]).find((m) => MODES[m].slug === slug);
}
