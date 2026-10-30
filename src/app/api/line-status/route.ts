import { findBoard } from "@/providers/registry";
import { getLineStatus } from "@/server/line-status";

export const dynamic = "force-dynamic";

/** GET /api/line-status?mode=subway&region=nyc: how each line is running, from service alerts. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const board = findBoard(params.get("mode") ?? "", params.get("region") ?? "");
  if (!board) return Response.json({ error: "Unknown board" }, { status: 404 });
  try {
    return Response.json(await getLineStatus(board), { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
  } catch {
    return Response.json({ error: "Service status is unavailable right now" }, { status: 502 });
  }
}
