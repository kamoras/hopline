import { findBoard } from "@/providers/registry";
import { getArrivals } from "@/server/arrivals";

export const dynamic = "force-dynamic";

/** GET /api/arrivals?mode=subway&region=nyc&place=times-sq-42-st: trains due at a station. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const board = findBoard(params.get("mode") ?? "", params.get("region") ?? "");
  if (!board) return Response.json({ error: "Unknown board" }, { status: 404 });
  const arrivals = await getArrivals(board, params.get("place") ?? "");
  return Response.json(arrivals, { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" } });
}
