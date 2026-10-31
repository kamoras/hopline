import { MODES } from "@/domain/modes";
import type { Place } from "@/domain/place";
import { parseBbox } from "@/lib/bbox";
import { findBoard } from "@/providers/registry";
import { getPlaceIndex, getPlaces } from "@/server/places";

export const dynamic = "force-dynamic";

const LIMIT = 300;
const SEARCH_LIMIT = 15;
const NEAR_COUNT = 5;

/**
 * GET /api/places?mode=rail&region=northeast: stations/airports for a board.
 * A big network (buses) is asked for what it needs: `&bbox=w,s,e,n` (what is on screen), `&near=lat,lon`
 * (the closest few), `&q=harvard` (by name) or `&id=...`, any combination; with none it returns nothing.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const board = findBoard(params.get("mode") ?? "", params.get("region") ?? "");
  if (!board) return Response.json({ error: "Unknown board" }, { status: 404 });

  if (!MODES[board.mode].viewport) {
    return Response.json(await getPlaces(board), { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  }

  const index = await getPlaceIndex(board);
  const found = new Map<string, Place>();
  const add = (list: readonly Place[]) => list.forEach((p) => found.set(p.id, p));
  const bbox = parseBbox(params.get("bbox"));
  if (bbox) add(index.inBox(bbox, LIMIT));
  const [lat, lon] = (params.get("near") ?? "").split(",").map(Number);
  if (Number.isFinite(lat) && Number.isFinite(lon)) add(index.near({ lat: lat!, lon: lon! }, NEAR_COUNT));
  const q = params.get("q");
  if (q) add(index.search(q.slice(0, 80), SEARCH_LIMIT));
  const id = params.get("id");
  const one = id ? index.get(id) : undefined;
  if (one) add([one]);
  return Response.json([...found.values()], { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
