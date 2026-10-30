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
    searchPlaceholder: "Train number or station…",
    searchHint: "Try a train number like 2150, or a station like Stamford.",
  },
} as const satisfies Record<string, ModeInfo>;

export type Mode = keyof typeof MODES;

export function getMode(slug: string): Mode | undefined {
  return (Object.keys(MODES) as Mode[]).find((m) => MODES[m].slug === slug);
}
