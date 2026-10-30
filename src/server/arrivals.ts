import type { Arrival } from "@/domain/arrival";
import type { Board } from "@/domain/board";
import { providersFor } from "@/providers/registry";
import { getPlaces } from "./places";

/** Trains due at a place on this board, soonest first; empty if the place is unknown or no provider has arrivals. */
export async function getArrivals(board: Board, placeId: string, now = Date.now()): Promise<Arrival[]> {
  const place = (await getPlaces(board)).find((p) => p.id === placeId);
  if (!place) return [];
  const lists = await Promise.all(
    providersFor(board).map((p) =>
      p.fetchArrivals?.({ region: board.region, now, diag: {}, signal: AbortSignal.timeout(8_000) }, place).catch(() => []) ?? [],
    ),
  );
  return lists.flat().sort((a, b) => a.at - b.at);
}
