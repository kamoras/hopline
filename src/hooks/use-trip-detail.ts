"use client";

import useSWR from "swr";
import type { BoardLink } from "@/domain/board";
import { MODES } from "@/domain/modes";
import type { Trip } from "@/domain/trip";
import { REFRESH_MS } from "./use-trips";

const fetcher = async (url: string): Promise<Trip | undefined> => {
  const res = await fetch(url);
  return res.ok ? ((await res.json()) as Trip) : undefined;
};

/**
 * One vehicle with all of its stops, for its drawer. The map polls vehicles without their stops (`lib/lean.ts`); this asks
 * for the open vehicle's, and refreshes them while the drawer is open. Nothing until there is a vehicle to ask about. When the vehicle leaves the feed (its run ended) the last full answer stays.
 */
export function useTripDetail(board: BoardLink | undefined, trip: Trip | undefined): Trip | undefined {
  const url =
    board && trip
      ? `/api/trip?mode=${board.mode}&region=${board.regionId}&id=${encodeURIComponent(trip.id)}${MODES[board.mode].viewport ? `&route=${encodeURIComponent(trip.number)}` : ""}`
      : null;
  const { data } = useSWR(url, fetcher, { refreshInterval: REFRESH_MS, revalidateOnFocus: false, keepPreviousData: true });
  return data;
}
