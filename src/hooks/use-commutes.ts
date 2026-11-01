"use client";

import { useCallback, useMemo } from "react";
import { routeKey, type Route } from "@/lib/query";
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
  /** Save all given routes, or remove them all if every one is already saved (one write, so round trips can't clobber each other). */
  const toggle = useCallback(
    (routes: readonly Route[]) => {
      const keys = new Set(routes.map(routeKey));
      const next = routes.every(isSaved)
        ? all.filter((c) => !(c.board === boardKey && keys.has(routeKey(c))))
        : [...all, ...routes.filter((r) => !isSaved(r)).map((r) => ({ from: r.from, to: r.to, board: boardKey }))];
      setRaw(JSON.stringify(next));
    },
    [all, boardKey, isSaved, setRaw],
  );
  return { commutes, isSaved, toggle };
}

/** Every saved commute on this device, with the board each belongs to (for the home app, which spans all boards). */
export function useAllCommutes() {
  const [raw, setRaw] = useLocalStore(KEY);
  const all = useMemo<(Route & { board: string })[]>(() => {
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.from === "string" && typeof c.to === "string" && typeof c.board === "string") : [];
    } catch {
      return [];
    }
  }, [raw]);
  const isSaved = useCallback((board: string, r: Route) => all.some((c) => c.board === board && routeKey(c) === routeKey(r)), [all]);
  /** Save the routes on a board, or remove them all if every one is already saved. */
  const toggle = useCallback(
    (board: string, routes: readonly Route[]) => {
      const keys = new Set(routes.map(routeKey));
      const saved = routes.every((r) => isSaved(board, r));
      const next = saved ? all.filter((c) => !(c.board === board && keys.has(routeKey(c)))) : [...all, ...routes.filter((r) => !isSaved(board, r)).map((r) => ({ from: r.from, to: r.to, board }))];
      setRaw(JSON.stringify(next));
    },
    [all, isSaved, setRaw],
  );
  return { all, isSaved, toggle };
}
