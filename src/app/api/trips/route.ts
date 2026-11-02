import { findBoard } from "@/providers/registry";
import { parseBbox } from "@/lib/bbox";
import { leanTrip } from "@/lib/lean";
import { getSnapshot } from "@/server/snapshot";

export const dynamic = "force-dynamic";

/**
 * GET /api/trips?mode=rail&region=northeast
 * Big networks (buses) are asked for a part: `&bbox=w,s,e,n` for what is on screen, or `&route=1` for one route.
 * `&lean=1` (what the map polls) leaves out the stops a vehicle's drawer needs; see `lib/lean.ts` and `/api/trip`.
 * Public, user-agnostic and cacheable at the CDN edge (5 s), so a burst of
 * commuters costs a handful of upstream fetches, not one each.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get("mode") ?? "";
  const region = params.get("region") ?? "";
  const board = findBoard(mode, region);
  if (!board) return Response.json({ error: `No board for "${mode}/${region}"` }, { status: 404 });

  const snapshot = await getSnapshot(board, Date.now(), { bbox: parseBbox(params.get("bbox")), route: params.get("route") ?? undefined });
  const body = params.get("lean") === "1" ? { ...snapshot, trips: snapshot.trips.map((t) => leanTrip(t)) } : snapshot;
  return Response.json(body, {
    headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15" },
  });
}
