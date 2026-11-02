import { MODES } from "@/domain/modes";
import { findBoard } from "@/providers/registry";
import { getLines } from "@/server/lines";

export const dynamic = "force-dynamic";

/**
 * GET /api/lines?mode=rail&region=northeast: route geometry to draw on the map. Static, so cached for a day.
 * A big network (buses) sends one route's track on request (`&route=1`) and nothing otherwise.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const board = findBoard(params.get("mode") ?? "", params.get("region") ?? "");
  if (!board) return Response.json({ error: "Unknown board" }, { status: 404 });
  // A big network sends one route's track on request and nothing otherwise, and builds only that route's geometry.
  const route = params.get("route");
  const viewport = MODES[board.mode].viewport;
  const wanted = viewport && !route ? [] : await getLines(board, Date.now(), viewport ? route! : undefined);
  return Response.json(wanted, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
