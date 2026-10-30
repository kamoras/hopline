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
}

export const boardHref = (mode: Mode, regionId: string) => `/${MODES[mode].slug}/${regionId}`;

export const toLink = ({ mode, region }: Board): BoardLink => ({
  mode,
  regionId: region.id,
  regionName: region.name,
  href: boardHref(mode, region.id),
});

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
