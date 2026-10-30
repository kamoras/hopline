"use client";

import useSWR from "swr";
import type { LineStatus } from "@/domain/line-status";
import type { Mode } from "@/domain/modes";

const REFRESH_MS = 60_000;

const fetcher = async (url: string): Promise<LineStatus[]> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
};

/** How each line is running. `unavailable` is true when we can't tell, which is not the same as good. */
export function useLineStatus(mode: Mode, regionId: string, enabled: boolean) {
  const { data, error, isLoading } = useSWR(enabled ? `/api/line-status?mode=${mode}&region=${regionId}` : null, fetcher, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: true,
  });
  return { lines: data ?? [], unavailable: !!error && !data, isLoading };
}
