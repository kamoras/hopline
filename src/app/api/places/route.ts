import { findBoard } from "@/providers/registry";
import { getPlaces } from "@/server/places";

export const dynamic = "force-dynamic";

/** GET /api/places?mode=rail&region=northeast: stations/airports for a board. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const board = findBoard(params.get("mode") ?? "", params.get("region") ?? "");
  if (!board) return Response.json({ error: "Unknown board" }, { status: 404 });
  return Response.json(await getPlaces(board), { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
