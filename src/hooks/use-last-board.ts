"use client";

import { useEffect } from "react";
import { useLocalStore } from "./use-local-store";

const KEY = "hopline:last-board:v1";

/** Remembers the last board visited (on this device) so the home page can offer it. */
export function useRememberBoard(href: string) {
  const [, set] = useLocalStore(KEY);
  useEffect(() => set(href), [href, set]);
}

export function useLastBoard(): string | null {
  return useLocalStore(KEY)[0];
}
