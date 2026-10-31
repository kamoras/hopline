"use client";

import useSWR from "swr";
import type { Line } from "@/domain/line";
import type { Mode } from "@/domain/modes";

const fetcher = (url: string): Promise<Line[]> => fetch(url).then((r) => (r.ok ? r.json() : []));

/** Route geometry for the map. Static data: fetched once, never polled. A big network passes the chosen `route`. */
export function useLines(mode: Mode, regionId: string, enabled: boolean, route?: string): Line[] {
  const { data } = useSWR(enabled ? `/api/lines?mode=${mode}&region=${regionId}${route ? `&route=${encodeURIComponent(route)}` : ""}` : null, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateIfStale: false,
    revalidateOnReconnect: false,
  });
  return data ?? [];
}
