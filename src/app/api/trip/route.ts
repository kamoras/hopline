import { findBoard } from "@/providers/registry";
import { getSnapshot } from "@/server/snapshot";

export const dynamic = "force-dynamic";

/**
 * GET /api/trip?mode=rail&region=northeast&id=mnr:2150 (a bus adds `&route=39`): one vehicle with everything about it (every stop, with times),
 * for its drawer. The map's polling (`/api/trips?lean=1`) leaves the stops out; this is where they come back.
 * Answered from the board's shared snapshot, so it costs no more upstream than the map does.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const board = findBoard(params.get("mode") ?? "", params.get("region") ?? "");
  const id = params.get("id") ?? "";
  if (!board || !id || id.length > 120) return Response.json({ error: "No such vehicle" }, { status: 404 });
  // A big network (buses) answers only for a part, so its caller names the vehicle's route (its number).
  const snapshot = await getSnapshot(board, Date.now(), { route: params.get("route") ?? undefined });
  const trip = snapshot.trips.find((t) => t.id === id);
  if (!trip) return Response.json({ error: "No such vehicle" }, { status: 404 });
  return Response.json(trip, { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15" } });
}
