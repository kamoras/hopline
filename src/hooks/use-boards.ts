"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { BoardLink } from "@/domain/board";
import { formatBbox, snapBbox } from "@/lib/bbox";
import type { WorldView } from "@/lib/world";

const getJson = (url: string): Promise<BoardLink[]> => fetch(url).then((r) => (r.ok ? (r.json() as Promise<BoardLink[]>) : []));

/**
 * The boards the map can show: the ones the page came with, plus whatever covers the part of the map being looked at (asked
 * of the server, rounded outward so a pan reuses cached answers), plus a shared link's own board. Boards seen once are kept,
 * so moving back never has to ask again.
 */
export function useBoards(initial: readonly BoardLink[], view: WorldView | undefined, linked?: { mode: string; regionId: string }): BoardLink[] {
  const box = view ? formatBbox(snapBbox(view.bbox, 1)) : undefined;
  const seen = useSWR(box ? `/api/boards?bbox=${box}` : null, getJson, { keepPreviousData: true, revalidateOnFocus: false });
  const one = useSWR(linked ? `/api/boards?board=${linked.mode}/${linked.regionId}` : null, getJson, { revalidateOnFocus: false });
  return useMemo(() => {
    const byHref = new Map<string, BoardLink>();
    for (const b of [...initial, ...(one.data ?? []), ...(seen.data ?? [])]) byHref.set(b.href, b);
    return [...byHref.values()];
  }, [initial, seen.data, one.data]);
}
