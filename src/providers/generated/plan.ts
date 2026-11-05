/**
 * Turns the ingestion catalog (`catalog/ingested.json`) into regions and provider settings. Pure, so the decisions are tested:
 * which agencies are switched on, where each one's board sits, what time it is there, and whether a hand-built provider
 * already covers it.
 */
import type { Mode } from "@/domain/modes";
import type { Region } from "@/domain/region";

export interface IngestedAgency {
  id: string;
  key: string;
  name: string;
  state: string;
  mode: "bus" | "subway" | "rail" | "ferry";
  kind: "live" | "timetable";
  bbox: [number, number, number, number];
  feeds?: { tripUpdates?: string; vehicles?: string; alerts?: string };
}

const ZONES: Record<string, string> = {
  Alabama: "America/Chicago",
  Alaska: "America/Anchorage",
  Arizona: "America/Phoenix",
  Arkansas: "America/Chicago",
  California: "America/Los_Angeles",
  Colorado: "America/Denver",
  Connecticut: "America/New_York",
  Delaware: "America/New_York",
  "District of Columbia": "America/New_York",
  Florida: "America/New_York",
  Georgia: "America/New_York",
  Hawaii: "Pacific/Honolulu",
  Idaho: "America/Boise",
  Illinois: "America/Chicago",
  Indiana: "America/Indiana/Indianapolis",
  Iowa: "America/Chicago",
  Kansas: "America/Chicago",
  Kentucky: "America/New_York",
  Louisiana: "America/Chicago",
  Maine: "America/New_York",
  Maryland: "America/New_York",
  Massachusetts: "America/New_York",
  Michigan: "America/Detroit",
  Minnesota: "America/Chicago",
  Mississippi: "America/Chicago",
  Missouri: "America/Chicago",
  Montana: "America/Denver",
  Nebraska: "America/Chicago",
  Nevada: "America/Los_Angeles",
  "New Hampshire": "America/New_York",
  "New Jersey": "America/New_York",
  "New Mexico": "America/Denver",
  "New York": "America/New_York",
  "North Carolina": "America/New_York",
  "North Dakota": "America/Chicago",
  Ohio: "America/New_York",
  Oklahoma: "America/Chicago",
  Oregon: "America/Los_Angeles",
  Pennsylvania: "America/New_York",
  "Rhode Island": "America/New_York",
  "South Carolina": "America/New_York",
  "South Dakota": "America/Chicago",
  Tennessee: "America/Chicago",
  Texas: "America/Chicago",
  Utah: "America/Denver",
  Vermont: "America/New_York",
  Virginia: "America/New_York",
  Washington: "America/Los_Angeles",
  "West Virginia": "America/New_York",
  Wisconsin: "America/Chicago",
  Wyoming: "America/Denver",
};

/** The time zone of a place: its state's, adjusted where a state is split (a bus in El Paso runs on Mountain time). */
export function timeZoneOf(state: string, lon: number, lat: number): string {
  switch (state) {
    case "Texas":
      return lon < -104.5 ? "America/Denver" : "America/Chicago";
    case "Florida":
      return lon < -85.1 ? "America/Chicago" : "America/New_York";
    case "Tennessee":
      return lon > -85.5 ? "America/New_York" : "America/Chicago";
    case "Idaho":
      return lat > 45.5 ? "America/Los_Angeles" : "America/Boise";
    case "Oregon":
      return lon > -117.2 ? "America/Boise" : "America/Los_Angeles";
    case "Kansas":
    case "Nebraska":
    case "South Dakota":
    case "North Dakota":
      return lon < -101.5 ? "America/Denver" : "America/Chicago";
    case "Michigan":
      return lon < -87.5 && lat > 45.5
        ? "America/Menominee"
        : "America/Detroit";
    case "Indiana":
      return lon < -86.8 && (lat > 41.3 || lat < 38.5)
        ? "America/Chicago"
        : "America/Indiana/Indianapolis";
    default:
      return ZONES[state] ?? "America/New_York";
  }
}

/** A region around an agency's service area: padded a little, and zoomed to fit. */
export function regionOf(
  a: Pick<IngestedAgency, "id" | "name" | "state" | "bbox">,
): Region {
  const [w, s, e, n] = a.bbox;
  const padLon = Math.max((e - w) * 0.1, 0.03);
  const padLat = Math.max((n - s) * 0.1, 0.03);
  const bounds: Region["bounds"] = [
    w - padLon,
    s - padLat,
    e + padLon,
    n + padLat,
  ];
  const center: Region["center"] = [(w + e) / 2, (s + n) / 2];
  const span = Math.max(bounds[2] - bounds[0], (bounds[3] - bounds[1]) * 1.6);
  const zoom = Math.min(13, Math.max(3.5, Math.log2(360 / span) - 0.6));
  return {
    id: a.id,
    name: a.name,
    bounds,
    center,
    zoom: Math.round(zoom * 10) / 10,
    timeZone: timeZoneOf(a.state, center[0], center[1]),
  };
}

export const MODE_OF: Record<IngestedAgency["mode"], Mode> = {
  bus: "bus",
  subway: "subway",
  rail: "rail",
  ferry: "ferry",
};

/**
 * Which agencies to serve. Nothing is served without a data host (ingested schedules are not bundled) and a list of states
 * (`HOPLINE_STATES`: "all", or names separated by commas), so regions are switched on in waves.
 */
export function enabled(
  all: readonly IngestedAgency[],
  states: string | undefined,
  host: string | undefined,
): IngestedAgency[] {
  if (!host || !states?.trim()) return [];
  const wanted = new Set(
    states
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const everything = wanted.has("all");
  return all.filter((a) => everything || wanted.has(a.state.toLowerCase()));
}

/** Can the shared builders run this agency? A live one needs both feeds; the rest come from the timetable alone. */
export const servable = (a: IngestedAgency) =>
  a.kind === "timetable" || Boolean(a.feeds?.tripUpdates && a.feeds.vehicles);

/** Is this agency's centre inside an area a hand-built provider of the same mode already serves? (the hand-built one wins) */
export function covered(
  a: IngestedAgency,
  handBuilt: readonly { mode: Mode; region: Region }[],
): boolean {
  const lon = (a.bbox[0] + a.bbox[2]) / 2;
  const lat = (a.bbox[1] + a.bbox[3]) / 2;
  return handBuilt.some(
    ({
      mode,
      region: {
        bounds: [w, s, e, n],
      },
    }) =>
      mode === MODE_OF[a.mode] && lon >= w && lon <= e && lat >= s && lat <= n,
  );
}
