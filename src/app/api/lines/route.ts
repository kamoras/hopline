import { findBoard } from "@/providers/registry";
import { getLines } from "@/server/lines";

export const dynamic = "force-dynamic";

/** GET /api/lines?mode=rail&region=northeast: route geometry to draw on the map. Static, so cached for a day. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const board = findBoard(params.get("mode") ?? "", params.get("region") ?? "");
  if (!board) return Response.json({ error: "Unknown board" }, { status: 404 });
  return Response.json(await getLines(board), {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
