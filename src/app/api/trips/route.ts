import { findBoard } from "@/providers/registry";
import { getSnapshot } from "@/server/snapshot";

export const dynamic = "force-dynamic";

/**
 * GET /api/trips?mode=rail&region=northeast
 * Public, user-agnostic and cacheable at the CDN edge, so a burst of commuters
 * costs one upstream fetch rather than one each.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get("mode") ?? "";
  const region = params.get("region") ?? "";
  const board = findBoard(mode, region);
  if (!board) return Response.json({ error: `No board for "${mode}/${region}"` }, { status: 404 });

  const snapshot = await getSnapshot(board);
  return Response.json(snapshot, {
    headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
  });
}
