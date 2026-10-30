import type { Board } from "@/domain/board";
import type { Line } from "@/domain/line";
import { createPolyline, type Polyline } from "@/lib/polyline";
import { providersFor } from "@/providers/registry";

/** Track geometry from every provider that has it. Providers without geometry simply contribute none. */
export async function getLines(board: Board, now = Date.now()): Promise<Line[]> {
  const lists = await Promise.all(
    providersFor(board).map((p) =>
      p.fetchLines?.({ region: board.region, now, diag: {}, signal: AbortSignal.timeout(8_000) }).catch(() => []) ?? [],
    ),
  );
  return lists.flat();
}

const trackCache = new Map<string, Promise<Polyline[]>>();

/** The board's track as polylines, built once per server instance (it is static data). */
export function getTrack(board: Board): Promise<Polyline[]> {
  const key = `${board.mode}/${board.region.id}`;
  let hit = trackCache.get(key);
  if (!hit) {
    hit = getLines(board).then((lines) => lines.map((l) => createPolyline(l.coords.flatMap(([lon, lat]) => [lat, lon]))));
    trackCache.set(key, hit);
    hit.catch(() => trackCache.delete(key));
  }
  return hit;
}
