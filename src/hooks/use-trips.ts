"use client";

import useSWR from "swr";
import type { Mode, Snapshot } from "@/domain/trip";

/** How often the browser asks for fresh data. The server caches for about half of this. */
export const REFRESH_MS = 10_000;

async function fetcher(url: string): Promise<Snapshot> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

/** For a big network: the part of it to load. `null` means nothing yet (zoomed out, no route chosen). */
export type TripScope = { bbox: string } | { route: string } | null;

/**
 * Polls the aggregated snapshot, starting from the server-rendered one. A big network (buses) is asked for
 * only what is on screen or the chosen route; with neither it makes no request and shows no trips.
 */
export function useTrips(mode: Mode, regionId: string, initial: Snapshot, scope?: TripScope) {
  const base = `/api/trips?mode=${mode}&region=${regionId}`;
  const url = scope === undefined ? base : scope === null ? null : "route" in scope ? `${base}&route=${encodeURIComponent(scope.route)}` : `${base}&bbox=${scope.bbox}`;
  const { data, error, isValidating, mutate } = useSWR(url, fetcher, {
    fallbackData: initial,
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 4_000,
  });
  const snapshot = scope === null ? { ...initial, trips: [] } : (data ?? initial);
  return { snapshot, error: error as Error | undefined, isValidating, refresh: () => mutate() };
}
