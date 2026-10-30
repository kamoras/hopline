"use client";

import { useEffect, useState } from "react";

/**
 * Current time that re-renders on an interval so relative times ("in 4 min")
 * stay fresh. It starts from `seed` (the server snapshot's time) so the first
 * client render matches the server-rendered HTML exactly, then switches to the
 * real clock right after hydration.
 */
export function useNow(seed: number, intervalMs = 15_000): number {
  const [now, setNow] = useState(seed);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}
