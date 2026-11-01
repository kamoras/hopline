"use client";

import { useEffect, useMemo, useState } from "react";
import { MODES } from "@/domain/modes";
import type { Place } from "@/domain/place";
import type { Trip } from "@/domain/trip";
import { normalizeName } from "@/domain/place";
import { operatorName } from "@/domain/operators";
import { searchVehicles } from "@/lib/vehicle-search";
import { parseWorldPlaceId } from "@/lib/world";
import type { CatalogHit } from "@/server/catalog";
import { destinationPhrase } from "../trip-parts";
import type { PlaceTarget } from "./model-home";

/** What a search finds, in one list: vehicles running now, then stations and airports. Choosing one opens its drawer. */
export function SearchDrawer({
  query,
  trips,
  places,
  onOpenTrip,
  onOpenPlace,
}: {
  query: string;
  trips: readonly Trip[];
  places: readonly Place[];
  onOpenTrip(id: string): void;
  onOpenPlace(place: PlaceTarget): void;
}) {
  const [hits, setHits] = useState<{ query: string; found: CatalogHit[] }>();
  const q = query.trim();

  // Stations on the boards not in view (or not yet drawn) come from the server's catalog.
  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((found: CatalogHit[]) => setHits({ query: q, found }))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const vehicles = useMemo(() => searchVehicles(trips, q), [trips, q]);
  const stations = useMemo<PlaceTarget[]>(() => {
    const norm = normalizeName(q);
    const fromMap = places.flatMap((p): PlaceTarget[] => {
      const parsed = parseWorldPlaceId(p.id);
      return parsed && norm && normalizeName(p.name).includes(norm) ? [{ id: parsed.placeId, name: p.name, mode: parsed.mode, regionId: parsed.regionId, lat: p.lat, lon: p.lon }] : [];
    });
    const seen = new Set(fromMap.map((p) => `${p.mode}/${p.regionId}/${p.id}`));
    const fromCatalog = (hits?.query === q ? hits.found : []).flatMap((h): PlaceTarget[] =>
      h.place && !seen.has(`${h.place.mode}/${h.place.regionId}/${h.place.id}`) ? [{ ...h.place, name: h.label }] : [],
    );
    return [...fromMap.slice(0, 6), ...fromCatalog].slice(0, 8);
  }, [places, hits, q]);

  const nothing = vehicles.length === 0 && stations.length === 0;
  return (
    <div className="space-y-5">
      <h2 tabIndex={-1} className="text-lg font-bold tracking-tight">
        {q ? `Results for “${q}”` : "Search"}
      </h2>
      {!q && <p className="text-sm text-muted">Try a train number, a flight like DAL1283, a line, a station or an airport.</p>}
      {q && nothing && <p className="text-sm text-muted">Nothing running or nearby matches yet. Zoom the map to where it is, or try another name.</p>}

      {vehicles.length > 0 && (
        <section aria-label="Vehicles running now">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Running now</h3>
          <ul className="space-y-2">
            {vehicles.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onOpenTrip(t.id)} className="press flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:bg-surface-2">
                  <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: t.routeColor }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      <span className="tabular font-semibold">{t.number}</span> <span className="text-muted">{destinationPhrase(t)}</span>
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {MODES[t.mode].label} · {operatorName(t.operatorId)}
                    </span>
                  </span>
                  <span aria-hidden className="text-muted">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stations.length > 0 && (
        <section aria-label="Stations and airports">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Stations and airports</h3>
          <ul className="space-y-2">
            {stations.map((p) => (
              <li key={`${p.mode}/${p.regionId}/${p.id}`}>
                <button type="button" onClick={() => onOpenPlace(p)} className="press flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted">{MODES[p.mode].label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
