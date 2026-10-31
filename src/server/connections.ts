import { boardHref, placeHref, type Board } from "@/domain/board";
import type { Mode } from "@/domain/modes";
import { nearestPlaces, type Place } from "@/domain/place";
import { inBounds } from "@/domain/region";
import { listBoards } from "@/providers/registry";
import { getPlaces } from "./places";

/** Another board's station right beside this one: where a rider can change between modes. */
export interface Connection {
  mode: Mode;
  regionId: string;
  placeId: string;
  name: string;
  /** Opens that station on its own board. */
  href: string;
}

/** About a three-minute walk. Stations further apart than this are not the same interchange. */
const MAX_MILES = 0.2;
const MAX_PER_BOARD = 3;

/**
 * The other modes' stations next to a place (Grand Central: its subway station). Only boards whose area
 * contains the place are consulted, so asking about a station never loads a faraway board's data.
 */
export async function getConnections(board: Board, place: Place): Promise<Connection[]> {
  const nearby = listBoards().filter((other) => other.mode !== board.mode && inBounds(other.region, place.lat, place.lon));
  const found = await Promise.all(
    nearby.map(async (other) => {
      const places = await getPlaces(other);
      return nearestPlaces(places, place, MAX_PER_BOARD)
        .filter((n) => n.miles <= MAX_MILES)
        .map(({ place: p }): Connection => ({ mode: other.mode, regionId: other.region.id, placeId: p.id, name: p.name, href: placeHref(boardHref(other.mode, other.region.id), p.id) }));
    }),
  );
  return found.flat();
}
