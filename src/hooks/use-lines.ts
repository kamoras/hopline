"use client";

import useSWR from "swr";
import type { Line } from "@/domain/line";
import type { Mode } from "@/domain/modes";

const fetcher = (url: string): Promise<Line[]> => fetch(url).then((r) => (r.ok ? r.json() : []));

/** Route geometry for the map. Static data: fetched once, never polled. */
export function useLines(mode: Mode, regionId: string, enabled: boolean): Line[] {
  const { data } = useSWR(enabled ? `/api/lines?mode=${mode}&region=${regionId}` : null, fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    revalidateOnReconnect: false,
  });
  return data ?? [];
}
