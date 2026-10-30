"use client";

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

type State = "off" | "asking" | "on" | "denied";

const LABEL: Record<State, string> = {
  off: "◎ Show my location",
  asking: "Locating…",
  on: "◉ Showing you",
  denied: "Location unavailable",
};

/**
 * Draws a "you are here" dot on the map. The position is read in the browser
 * and drawn locally; it is never sent anywhere or stored.
 */
export function useLocate(map: MapLibreMap | null) {
  const [state, setState] = useState<State>("off");
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const toggle = useCallback(() => {
    if (!map) return;
    if (!map.getSource("me")) {
      map.addSource("me", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "me-dot",
        type: "circle",
        source: "me",
        paint: { "circle-radius": 8, "circle-color": "#1f6feb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 },
      });
    }
    const me = map.getSource("me") as GeoJSONSource;
    if (state === "on" || state === "asking") {
      stop();
      me.setData({ type: "FeatureCollection", features: [] });
      return setState("off");
    }
    if (!("geolocation" in navigator)) return setState("denied");
    setState("asking");
    let first = true;
    watchId.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        me.setData({
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: { type: "Point", coordinates: [coords.longitude, coords.latitude] }, properties: {} }],
        });
        if (first) map.easeTo({ center: [coords.longitude, coords.latitude], zoom: Math.max(map.getZoom(), 11), duration: 800 });
        first = false;
        setState("on");
      },
      () => setState("denied"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
  }, [map, state, stop]);

  return { state, label: LABEL[state], toggle };
}
