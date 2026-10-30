"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { MODES } from "@/domain/modes";
import { NORTHEAST } from "@/domain/region";
import type { RegionPin } from "./types";
import { BaseMap } from "../map/base-map";

/** World-scale map where every board is a tappable bubble: the playful way in. */
export default function HomeMap({ pins }: { pins: RegionPin[] }) {
  const router = useRouter();
  const bounds = useMemo<[number, number, number, number]>(() => {
    const lons = pins.map((p) => p.lon);
    const lats = pins.map((p) => p.lat);
    const pad = 3;
    return pins.length
      ? [Math.min(...lons) - pad, Math.min(...lats) - pad, Math.max(...lons) + pad, Math.max(...lats) + pad]
      : NORTHEAST.bounds;
  }, [pins]);

  const setup = useCallback(
    (map: MapLibreMap) => {
      map.addSource("boards", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: pins.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.lon, p.lat] },
            properties: { href: p.href, label: `${MODES[p.mode].label} · ${p.name}` },
          })),
        },
      });
      map.addLayer({
        id: "board-dots",
        type: "circle",
        source: "boards",
        paint: {
          "circle-radius": 14,
          "circle-color": "#1f6feb",
          "circle-opacity": 0.9,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      });
      map.addLayer({
        id: "board-labels",
        type: "symbol",
        source: "boards",
        layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-offset": [0, 1.5], "text-anchor": "top" },
        paint: { "text-color": "#11151c", "text-halo-color": "#ffffff", "text-halo-width": 2 },
      });
      for (const layer of ["board-dots", "board-labels"]) {
        map.on("click", layer, (e) => {
          const href = e.features?.[0]?.properties?.href;
          if (typeof href === "string") router.push(href);
        });
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
    },
    [pins, router],
  );

  return <BaseMap bounds={bounds} onReady={setup} />;
}
