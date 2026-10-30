"use client";

import { useCallback, useMemo } from "react";
import { routeKey, type Route } from "@/lib/search";
import { useLocalStore } from "./use-local-store";

const KEY = "hopline:commutes:v1";

/** Saved "A to B" routes, stored on this device only. Scoped per board. */
export function useCommutes(boardKey: string) {
  const [raw, setRaw] = useLocalStore(KEY);
  const all = useMemo<(Route & { board: string })[]>(() => {
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.from === "string" && typeof c.to === "string") : [];
    } catch {
      return [];
    }
  }, [raw]);

  const commutes = useMemo(() => all.filter((c) => c.board === boardKey), [all, boardKey]);
  const isSaved = useCallback((r: Route) => commutes.some((c) => routeKey(c) === routeKey(r)), [commutes]);
  const toggle = useCallback(
    (r: Route) =>
      setRaw(
        JSON.stringify(
          isSaved(r) ? all.filter((c) => !(c.board === boardKey && routeKey(c) === routeKey(r))) : [...all, { ...r, board: boardKey }],
        ),
      ),
    [all, boardKey, isSaved, setRaw],
  );
  return { commutes, isSaved, toggle };
}
