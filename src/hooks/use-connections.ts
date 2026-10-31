"use client";

import useSWR from "swr";
import type { Mode } from "@/domain/modes";
import type { Connection } from "@/server/connections";

const fetcher = (url: string): Promise<Connection[]> => fetch(url).then((r) => (r.ok ? r.json() : []));

/** Other modes' stations beside this one. Static data: fetched once per station, never polled. */
export function useConnections(mode: Mode, regionId: string, placeId: string): Connection[] {
  const { data } = useSWR(`/api/connections?mode=${mode}&region=${regionId}&place=${encodeURIComponent(placeId)}`, fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    revalidateOnReconnect: false,
  });
  return data ?? [];
}
