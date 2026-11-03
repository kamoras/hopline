import { toLink } from "@/domain/board";
import { parseBbox } from "@/lib/bbox";
import { boardsIn, MAX_BOARDS_PER_ANSWER } from "@/lib/boards";
import { findBoard, listBoards } from "@/providers/registry";

export const dynamic = "force-dynamic";

/** The widest view this answers for (degrees on a side): a screen at low zoom is not asking about boards yet. */
const MAX_SPAN_DEG = 40;

/**
 * GET /api/boards?bbox=w,s,e,n: the boards (a mode in a region) whose area overlaps what the map is looking at, so the
 * page need not carry every board of the country. `?board=rail/northeast` answers for one (a shared link's board).
 * Static for a given deploy, cached for an hour.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const one = params.get("board");
  let boards = listBoards().map(toLink);
  if (one) {
    const [mode = "", region = ""] = one.split("/");
    const board = findBoard(mode, region);
    boards = board ? [toLink(board)] : [];
  } else {
    const box = parseBbox(params.get("bbox"), MAX_SPAN_DEG);
    if (!box) return Response.json({ error: "A bbox is needed (w,s,e,n, at most 40 degrees a side)" }, { status: 400 });
    boards = boardsIn(boards, box).slice(0, MAX_BOARDS_PER_ANSWER);
  }
  return Response.json(boards, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
