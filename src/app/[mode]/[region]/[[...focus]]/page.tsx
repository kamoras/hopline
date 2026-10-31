import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Board } from "@/components/board";
import { boardHref, parseFocus, toLink } from "@/domain/board";
import { MODES } from "@/domain/modes";
import { findBoard, listBoards } from "@/providers/registry";
import { getPlaceIndex, getPlaces } from "@/server/places";
import { getSnapshot } from "@/server/snapshot";

// Server-render with fresh data so the first paint already shows trips;
// the client then takes over polling.
export const revalidate = 15;

type Params = Promise<{ mode: string; region: string; focus?: string[] }>;

export function generateStaticParams() {
  return listBoards().map((b) => ({ mode: MODES[b.mode].slug, region: b.region.id, focus: [] }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { mode, region } = await params;
  const board = findBoard(mode, region);
  return board ? { title: `${MODES[board.mode].label} · ${board.region.name}` } : {};
}

/**
 * /{mode}/{region}                  the board
 * /{mode}/{region}/trip/{operator}-{number}   a trip, shareable
 * /{mode}/{region}/stop/{place}     a station's departures, shareable
 */
export default async function Page({ params }: { params: Params }) {
  const { mode, region, focus: segments = [] } = await params;
  const board = findBoard(mode, region);
  const focus = parseFocus(segments);
  if (!board || !focus) notFound();
  // Old links used the mode's internal id ("/subway/..."): send them to the canonical address.
  if (mode !== MODES[board.mode].slug) redirect([boardHref(board.mode, board.region.id), ...segments].join("/"));

  // A big network (buses) never ships its thousands of stops with the page; the browser asks for the ones it needs.
  const viewport = MODES[board.mode].viewport;
  const [snapshot, places] = await Promise.all([getSnapshot(board), viewport ? [] : getPlaces(board)]);
  if (focus.placeId && !(viewport ? (await getPlaceIndex(board)).get(focus.placeId) : places.some((p) => p.id === focus.placeId))) notFound();

  return (
    <Board
      mode={board.mode}
      region={board.region}
      href={boardHref(board.mode, board.region.id)}
      boards={listBoards().map(toLink)}
      places={places}
      initialFocus={focus}
      initial={snapshot}
    />
  );
}
