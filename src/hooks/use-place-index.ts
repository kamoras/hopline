"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { Mode } from "@/domain/modes";
import type { Place } from "@/domain/place";
import type { LatLon } from "@/lib/geo";

const fetcher = (url: string): Promise<Place[]> => fetch(url).then((r) => (r.ok ? r.json() : []));

export interface PlaceQuery {
  /** Stops in the visible area ("w,s,e,n"); only worth asking for when zoomed in. */
  bbox?: string;
  /** The person's location, for the stops closest to them. */
  near?: LatLon;
  /** What they typed. */
  q?: string;
  /** A stop opened by link. */
  id?: string;
}

const keep = { revalidateOnFocus: false, revalidateIfStale: false, revalidateOnReconnect: false } as const;

/** One kind of request (in view, near, by name, by id). */
const useParts = (base: string, enabled: boolean, suffix: string | undefined, panning = false) =>
  useSWR(enabled && suffix ? `${base}&${suffix}` : null, fetcher, { ...keep, keepPreviousData: panning }).data;

/**
 * The places of a big network that the screen needs right now: stops in view, stops near the person,
 * matches for what they typed, and the stop they opened. Each is its own cacheable request; the result is
 * their union, so the rest of the app can treat it like the full list of a small board.
 */
export function usePlaceIndex(mode: Mode, regionId: string, enabled: boolean, { bbox, near, q, id }: PlaceQuery): Place[] {
  const base = `/api/places?mode=${mode}&region=${regionId}`;
  const inView = useParts(base, enabled, bbox && `bbox=${bbox}`, true); // keep the old stops on screen while the next area loads
  const closest = useParts(base, enabled, near && `near=${near.lat.toFixed(3)},${near.lon.toFixed(3)}`);
  const matches = useParts(base, enabled, q && `q=${encodeURIComponent(q)}`);
  const opened = useParts(base, enabled, id && `id=${encodeURIComponent(id)}`);
  return useMemo(() => [...new Map([...(inView ?? []), ...(closest ?? []), ...(matches ?? []), ...(opened ?? [])].map((p) => [p.id, p])).values()], [inView, closest, matches, opened]);
}
