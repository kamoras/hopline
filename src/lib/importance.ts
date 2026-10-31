import type { Line } from "@/domain/line";
import type { Place } from "@/domain/place";
import { createPolyline } from "./polyline";
import { TrackIndex } from "./track-index";

/** A place counts a line as its own when track passes this close. */
const NEAR_TRACK_M = 150;

/**
 * How much each place matters on a crowded map, from what is around it: the number of different lines through
 * it (an interchange outranks a local stop), whether a line ends there (termini orient a rider), and a little for
 * places several operators or platforms share. Used to decide which stations stay labeled when zoomed out.
 */
export function placeImportance(places: readonly Place[], lines: readonly Line[]): Map<string, number> {
  const polylines = lines.map((l) => createPolyline(l.coords.flatMap(([lon, lat]) => [lat, lon])));
  const key = (l: Line) => l.route ?? l.name;
  const index = new TrackIndex(polylines, NEAR_TRACK_M);
  const ends = polylines.flatMap((p) => [p.pts[0], p.pts.at(-1)]).filter((p) => !!p);

  const out = new Map<string, number>();
  for (const place of places) {
    const through = new Set([...index.nearbyLines(place)].map((i) => key(lines[i]!)));
    const terminus = ends.some((e) => Math.abs(e.lat - place.lat) < 0.002 && Math.abs(e.lon - place.lon) < 0.003);
    out.set(place.id, through.size * 10 + (terminus ? 6 : 0) + Math.min(place.codes?.length ?? 1, 6));
  }
  return out;
}
