import type { Board } from "@/domain/board";
import { MODES } from "@/domain/modes";
import type { Line } from "@/domain/line";
import { createPolyline } from "@/lib/polyline";
import type { TrackIndex } from "@/lib/track-index";
import { providersFor } from "@/providers/registry";
import { indexTrack } from "./snap";

/**
 * Track geometry from every provider that has it. Providers without geometry simply contribute none.
 * Providers are drawn in reverse registry order, so a first-listed operator's line sits on top where two share track.
 */
export async function getLines(board: Board, now = Date.now(), route?: string): Promise<Line[]> {
  const lists = await Promise.all(
    providersFor(board).map((p) =>
      p.fetchLines?.({ region: board.region, now, diag: {}, signal: AbortSignal.timeout(8_000), route }).catch(() => []) ?? [],
    ),
  );
  return lists.reverse().flat();
}

const trackCache = new Map<string, Promise<TrackIndex>>();

/** The board's track as a spatial index, built once per server instance (it is static data). */
export function getTrack(board: Board): Promise<TrackIndex> {
  // A big network (buses) is not snapped to its routes: GPS is good enough at that scale, and holding every route's
  // geometry for a spatial index would cost far more memory than it is worth.
  if (MODES[board.mode].viewport) return Promise.resolve(indexTrack([]));
  const key = `${board.mode}/${board.region.id}`;
  let hit = trackCache.get(key);
  if (!hit) {
    hit = getLines(board).then((lines) => indexTrack(lines.map((l) => createPolyline(l.coords.flatMap(([lon, lat]) => [lat, lon])))));
    trackCache.set(key, hit);
    hit.catch(() => trackCache.delete(key));
  }
  return hit;
}
