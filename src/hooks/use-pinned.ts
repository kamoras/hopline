"use client";

import { useCallback, useMemo } from "react";
import { useLocalStore } from "./use-local-store";

const KEY = "hopline:pinned:v1";

/** "My trips": operator+number keys saved on this device only. */
export function usePinned() {
  const [raw, setRaw] = useLocalStore(KEY);
  const pinned = useMemo<string[]>(() => {
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }, [raw]);

  const toggle = useCallback(
    (key: string) => setRaw(JSON.stringify(pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key])),
    [pinned, setRaw],
  );
  return { pinned, toggle };
}
