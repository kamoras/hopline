import type { Board } from "@/domain/board";
import { normalizeName } from "@/domain/place";
import { providersFor } from "@/providers/registry";

/** A route riders ask for by number or name. */
export interface RouteSummary {
  route: string;
  name: string;
  color: string;
}

const LIMIT = 12;
/** Numbers sort as numbers ("2" before "10"), then by name. */
const byRoute = (a: RouteSummary, b: RouteSummary) => a.route.localeCompare(b.route, undefined, { numeric: true });

const cache = new Map<string, Promise<RouteSummary[]>>();

function allRoutes(board: Board): Promise<RouteSummary[]> {
  const key = `${board.mode}/${board.region.id}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = Promise.all(
      providersFor(board).map((p) => p.fetchRoutes?.({ region: board.region, now: Date.now(), diag: {}, signal: AbortSignal.timeout(8_000) }).catch(() => []) ?? []),
    ).then((lists) => {
      const routes = new Map<string, RouteSummary>();
      for (const r of lists.flat()) if (r.route && !routes.has(r.route)) routes.set(r.route, r);
      return [...routes.values()].sort(byRoute);
    });
    cache.set(key, hit);
    hit.catch(() => cache.delete(key));
  }
  return hit;
}

/** Routes whose number starts with the query, then those whose number or name contains it. */
export async function searchRoutes(board: Board, query: string): Promise<RouteSummary[]> {
  const q = normalizeName(query);
  if (!q) return [];
  const routes = await allRoutes(board);
  const exact = routes.filter((r) => normalizeName(r.route).startsWith(q));
  const rest = routes.filter((r) => !exact.includes(r) && (normalizeName(r.route).includes(q) || normalizeName(r.name).includes(q)));
  return [...exact, ...rest].slice(0, LIMIT);
}
