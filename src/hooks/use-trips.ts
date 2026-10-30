"use client";

import useSWR from "swr";
import type { Mode, Snapshot } from "@/domain/trip";

const REFRESH_MS = 15_000;

async function fetcher(url: string): Promise<Snapshot> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

/** Polls the aggregated snapshot, starting from the server-rendered one. */
export function useTrips(mode: Mode, regionId: string, initial: Snapshot) {
  const { data, error, isValidating, mutate } = useSWR(`/api/trips?mode=${mode}&region=${regionId}`, fetcher, {
    fallbackData: initial,
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 5_000,
  });
  return { snapshot: data ?? initial, error: error as Error | undefined, isValidating, refresh: () => mutate() };
}
