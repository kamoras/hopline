"use client";

import useSWR from "swr";
import type { Mode } from "@/domain/modes";
import type { RouteSummary } from "@/server/routes";

const fetcher = (url: string): Promise<RouteSummary[]> => fetch(url).then((r) => (r.ok ? r.json() : []));

/** Routes matching what was typed ("39", "sl"), for a network people search by route number. */
export function useRoutes(mode: Mode, regionId: string, query: string, enabled: boolean): RouteSummary[] {
  const q = query.trim();
  const { data } = useSWR(enabled && q ? `/api/routes?mode=${mode}&region=${regionId}&q=${encodeURIComponent(q)}` : null, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  return data ?? [];
}
