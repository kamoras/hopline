"use client";

import { getVersion, Map as MapLibreMap, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** OpenFreeMap: free, keyless vector tiles. Swap the URL to change providers. */
const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
const LIGHT_STYLE = "https://tiles.openfreemap.org/styles/positron";
const DARK_STYLE = "https://tiles.openfreemap.org/styles/dark";

/** Whether the person's device is set to a dark appearance (read in the browser only). */
export const prefersDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

// Worker is copied to /public by scripts/copy-maplibre-worker.mjs (bundlers break its default lookup).
setWorkerUrl(`/maplibre/maplibre-gl-worker.mjs?v=${getVersion()}`);

interface Props {
  bounds: [number, number, number, number];
  /** Called once the style has loaded; add sources and layers here. */
  onReady(map: MapLibreMap): void;
  /** Where the zoom buttons sit (default top right); a map with a floating header moves them out from under it. */
  controlsPosition?: "top-right" | "bottom-right";
  /** Overlays (legends, buttons) drawn over the map. */
  children?: ReactNode;
}

/** The one place that knows how to create, theme and tear down a map. */
export function BaseMap({ bounds, onReady, controlsPosition = "top-right", children }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    ready.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({
      container: container.current,
      style: STYLE_URL || (prefersDark() ? DARK_STYLE : LIGHT_STYLE),
      bounds,
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), controlsPosition);

    let loaded = false;
    map.on("error", (e) => {
      // Style/tiles unreachable: show a notice, keep the app usable.
      if (!loaded && e.error) setFailed(true);
    });
    map.on("load", () => {
      loaded = true;
      ready.current(map);
    });
    return () => map.remove();
    // The map is created once per bounds; callbacks are read through a ref.
  }, [bounds, controlsPosition]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-2">
      <div ref={container} className="h-full w-full" />
      {failed && (
        <div className="absolute inset-x-3 top-14 rounded-xl border border-line bg-surface p-3 text-sm text-muted shadow">
          The base map couldn&apos;t load. Trips will appear once it does.
        </div>
      )}
      {children}
    </div>
  );
}
