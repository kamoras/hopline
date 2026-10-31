import { findBoard } from "@/providers/registry";
import { getConnections } from "@/server/connections";
import { getPlaces } from "@/server/places";

export const dynamic = "force-dynamic";

/**
 * GET /api/connections?mode=rail&region=northeast&place=grand-central: stations of other modes next to this
 * one (its subway station, say), each with a link to open it. Static data, cached for an hour.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const board = findBoard(params.get("mode") ?? "", params.get("region") ?? "");
  if (!board) return Response.json({ error: "No such board" }, { status: 404 });
  const place = (await getPlaces(board)).find((p) => p.id === params.get("place"));
  if (!place) return Response.json({ error: "No such place" }, { status: 404 });
  return Response.json(await getConnections(board, place), { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
