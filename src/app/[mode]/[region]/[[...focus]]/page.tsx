import { notFound, permanentRedirect } from "next/navigation";
import { parseFocus } from "@/domain/board";
import { linkHref, type Link } from "@/lib/deeplink";
import { findBoard } from "@/providers/registry";

type Params = Promise<{ mode: string; region: string; focus?: string[] }>;

/**
 * The old per-board addresses now lead into the app, which is one page:
 *   /{mode}/{region}                  starts the map over that board
 *   /{mode}/{region}/trip/{op}-{num}  opens that vehicle's drawer
 *   /{mode}/{region}/stop/{place}     opens that station's drawer
 * (an old "/subway/..." works too: the registry knows each mode's earlier name).
 */
export default async function Page({ params }: { params: Params }) {
  const { mode, region, focus: segments = [] } = await params;
  const board = findBoard(mode, region);
  const focus = parseFocus(segments);
  if (!board || !focus) notFound();

  const at = { mode: board.mode, regionId: board.region.id };
  const link: Link = focus.tripKey ? { kind: "trip", key: focus.tripKey, ...at } : focus.placeId ? { kind: "place", placeId: focus.placeId, ...at } : { kind: "board", ...at };
  permanentRedirect(linkHref(link));
}
