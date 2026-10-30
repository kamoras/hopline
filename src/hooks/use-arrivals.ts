"use client";

import useSWR from "swr";
import type { Arrival } from "@/domain/arrival";
import type { Mode } from "@/domain/modes";
import { REFRESH_MS } from "./use-trips";

const fetcher = async (url: string): Promise<Arrival[]> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
};

/** Trains due at a station, refreshed while its sheet is open. Pass no place to stay idle. */
export function useArrivals(mode: Mode, regionId: string, placeId: string | undefined) {
  const { data, error, isLoading } = useSWR(placeId ? `/api/arrivals?mode=${mode}&region=${regionId}&place=${encodeURIComponent(placeId)}` : null, fetcher, {
    refreshInterval: REFRESH_MS,
    keepPreviousData: false,
    dedupingInterval: 4_000,
  });
  return { arrivals: data ?? [], error: error as Error | undefined, isLoading };
}
