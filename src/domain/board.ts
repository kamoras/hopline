import type { Mode } from "./modes";
import { MODES } from "./modes";
import type { Region } from "./region";

/**
 * A board is what a person actually looks at: one mode in one area, e.g.
 * trains in the Northeast or flights at Bradley. Boards are not configured
 * separately; they exist wherever a provider serves a (mode, region) pair, so
 * the UI can never offer an empty one.
 */
export interface Board {
  mode: Mode;
  region: Region;
}

/** Serializable form for client components. */
export interface BoardLink {
  mode: Mode;
  regionId: string;
  regionName: string;
  href: string;
  /** [lon, lat] and [west, south, east, north], so the client can pick the board for where you are looking. */
  center: [number, number];
  bounds: [number, number, number, number];
}

export const boardHref = (mode: Mode, regionId: string) => `/${MODES[mode].slug}/${regionId}`;

export const toLink = ({ mode, region }: Board): BoardLink => ({
  mode,
  regionId: region.id,
  regionName: region.name,
  href: boardHref(mode, region.id),
  center: region.center,
  bounds: region.bounds,
});

/**
 * The board of `mode` to show for a map location: the one whose area contains it, else the closest.
 * This is what lets a tab for another mode open "the same place" (Rail at New York, then Subway, is the
 * New York subway, not Boston's).
 */
export function nearestBoard(boards: readonly BoardLink[], mode: Mode, at: { lat: number; lon: number }): BoardLink | undefined {
  const candidates = boards.filter((b) => b.mode === mode);
  const inside = candidates.filter(({ bounds: [w, s, e, n] }) => at.lon >= w && at.lon <= e && at.lat >= s && at.lat <= n);
  const pool = inside.length ? inside : candidates;
  const dist = (b: BoardLink) => Math.hypot((b.center[0] - at.lon) * Math.cos((at.lat * Math.PI) / 180), b.center[1] - at.lat);
  return [...pool].sort((a, b) => dist(a) - dist(b))[0];
}

/** Deep-link paths inside a board. A trip key is `operator:number`; colons become `-` in URLs. */
export const tripHref = (base: string, key: string) => `${base}/trip/${encodeURIComponent(key.replace(":", "-"))}`;
export const placeHref = (base: string, placeId: string) => `${base}/stop/${encodeURIComponent(placeId)}`;

export interface Focus {
  tripKey?: string;
  placeId?: string;
}

/** Inverse of tripHref/placeHref: the segments after `/{mode}/{region}`. */
export function parseFocus(segments: readonly string[]): Focus | undefined {
  if (segments.length === 0) return {};
  if (segments.length !== 2) return undefined;
  const [kind, value = ""] = segments.map(decodeURIComponent);
  if (kind === "trip" && value.includes("-")) return { tripKey: value.replace("-", ":") };
  if (kind === "stop" && value) return { placeId: value };
  return undefined;
}
