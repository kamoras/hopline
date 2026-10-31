"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { BoardLink } from "@/domain/board";
import type { Line } from "@/domain/line";
import type { Mode } from "@/domain/modes";
import type { Place } from "@/domain/place";
import type { Snapshot, Trip } from "@/domain/trip";
import { activeBoards, requestsFor, worldPlaceId, type WorldView } from "@/lib/world";
import { REFRESH_MS } from "./use-trips";

const getJson = <T,>(url: string): Promise<T> => fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(`${url}: ${r.status}`))));

/** Fetches a list of URLs together. One key per list, so the number of boards in view can change without changing hooks. */
function useAll<T>(urls: readonly string[], refreshMs: number | undefined): (T | undefined)[] {
  const key = urls.length ? urls.join(" ") : null;
  const { data } = useSWR(key, (k: string) => Promise.all(k.split(" ").map((u) => getJson<T>(u).catch(() => undefined))), {
    refreshInterval: refreshMs,
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 4_000,
  });
  return data ?? [];
}

export interface World {
  trips: Trip[];
  places: Place[];
  lines: Line[];
  /** Which board a trip came from, to open its answer. */
  boardOfTrip: ReadonlyMap<string, BoardLink>;
  /** The boards currently shown. */
  boards: BoardLink[];
  /** How many vehicles are moving, per mode, for the chips. */
  counts: Partial<Record<Mode, number>>;
}

/**
 * Every board in view, merged into one model of transit: its trips (live), track and stations. Boards that are
 * out of view, too far away to read, or switched off are not fetched at all.
 */
export function useWorld(allBoards: readonly BoardLink[], view: WorldView | undefined, modes: ReadonlySet<Mode>): World {
  const boards = useMemo(() => activeBoards(allBoards, view, modes), [allBoards, view, modes]);
  const requests = useMemo(() => (view ? boards.map((b) => requestsFor(b, view)) : []), [boards, view]);

  const tripData = useAll<Snapshot>(requests.map((r) => r.trips), REFRESH_MS);
  const lineData = useAll<Line[]>(requests.flatMap((r) => (r.lines ? [r.lines] : [])), undefined);
  const placeData = useAll<Place[]>(requests.flatMap((r) => (r.places ? [r.places] : [])), undefined);

  return useMemo(() => {
    const boardOfTrip = new Map<string, BoardLink>();
    const counts: Partial<Record<Mode, number>> = {};
    const trips: Trip[] = [];
    requests.forEach((r, i) => {
      for (const t of tripData[i]?.trips ?? []) {
        trips.push(t);
        boardOfTrip.set(t.id, r.board);
      }
      counts[r.board.mode] = (counts[r.board.mode] ?? 0) + (tripData[i]?.trips.length ?? 0);
    });

    const withLines = requests.filter((r) => r.lines);
    const lines = withLines.flatMap((r, i) => (lineData[i] ?? []).map((l) => ({ ...l, id: `${r.board.mode}-${r.board.regionId}-${l.id}` })));
    const withPlaces = requests.filter((r) => r.places);
    const places = withPlaces.flatMap((r, i) => (placeData[i] ?? []).map((p) => ({ ...p, id: worldPlaceId(r.board, p.id) })));
    return { trips, places, lines, boardOfTrip, boards, counts };
  }, [requests, tripData, lineData, placeData, boards]);
}
