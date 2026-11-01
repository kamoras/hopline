"use client";

import { useCallback, useState } from "react";
import type { LatLon } from "@/lib/geo";

type State = { status: "idle" | "asking" | "denied" } | { status: "ready"; at: LatLon };

/**
 * One-shot, on-demand device location. Only asks when `request` is called,
 * keeps the result in memory, and never sends or stores it.
 */
export function useGeolocation() {
  const [state, setState] = useState<State>({ status: "idle" });
  const request = useCallback((onReady?: (at: LatLon) => void) => {
    if (!("geolocation" in navigator)) return setState({ status: "denied" });
    setState({ status: "asking" });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const at = { lat: p.coords.latitude, lon: p.coords.longitude };
        setState({ status: "ready", at });
        onReady?.(at);
      },
      () => setState({ status: "denied" }),
      { maximumAge: 60_000, timeout: 10_000 },
    );
  }, []);
  return { state, request };
}
