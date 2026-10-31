import { findBoard } from "@/providers/registry";
import { searchRoutes } from "@/server/routes";

export const dynamic = "force-dynamic";

/** GET /api/routes?mode=bus&region=boston&q=39: the routes of a board whose number or name matches. Static, cached for a day. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const board = findBoard(params.get("mode") ?? "", params.get("region") ?? "");
  if (!board) return Response.json({ error: "Unknown board" }, { status: 404 });
  return Response.json(await searchRoutes(board, (params.get("q") ?? "").slice(0, 40)), {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
