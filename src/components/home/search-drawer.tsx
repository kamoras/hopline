"use client";

import { useEffect, useMemo, useState } from "react";
import type { BoardLink } from "@/domain/board";
import { MODES } from "@/domain/modes";
import type { Place } from "@/domain/place";
import type { Trip } from "@/domain/trip";
import { normalizeName } from "@/domain/place";
import { operatorName } from "@/domain/operators";
import { searchVehicles } from "@/lib/vehicle-search";
import { parseWorldPlaceId } from "@/lib/world";
import { readableTextColor } from "@/lib/color";
import type { CatalogHit } from "@/server/catalog";
import type { RouteSummary } from "@/server/routes";
import { LineBadge } from "../line-badge";
import { destinationPhrase } from "../trip-parts";
import type { PlaceTarget } from "./model-home";

/** What a search finds, in one list: vehicles running now, then stations and airports. Choosing one opens its drawer. */
export function SearchDrawer({
  query,
  trips,
  places,
  boards,
  onOpenTrip,
  onOpenPlace,
  onOpenRoute,
}: {
  query: string;
  trips: readonly Trip[];
  places: readonly Place[];
  /** Every board, so routes of the big networks (buses) can be found even where they are not on the map. */
  boards: readonly BoardLink[];
  onOpenTrip(id: string): void;
  onOpenPlace(place: PlaceTarget): void;
  onOpenRoute(board: BoardLink, route: RouteSummary): void;
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

  // Routes of a big network (buses) are searched on the server, board by board.
  const [routeHits, setRouteHits] = useState<{ query: string; found: { board: BoardLink; route: RouteSummary }[] }>();
  useEffect(() => {
    const viewport = boards.filter((b) => MODES[b.mode].viewport);
    if (!q || viewport.length === 0) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      Promise.all(
        viewport.map((board) =>
          fetch(`/api/routes?mode=${board.mode}&region=${board.regionId}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
            .then((r) => (r.ok ? (r.json() as Promise<RouteSummary[]>) : []))
            .then((routes) => routes.slice(0, 5).map((route) => ({ board, route })))
            .catch(() => []),
        ),
      ).then((lists) => setRouteHits({ query: q, found: lists.flat().slice(0, 10) }));
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, boards]);
  const routes = routeHits?.query === q ? routeHits.found : [];

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

  const nothing = vehicles.length === 0 && stations.length === 0 && routes.length === 0;
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

      {routes.length > 0 && (
        <section aria-label="Routes">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Routes</h3>
          <ul className="space-y-2">
            {routes.map(({ board, route }) => (
              <li key={`${board.href}/${route.route}`}>
                <button type="button" onClick={() => onOpenRoute(board, route)} className="press flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:bg-surface-2">
                  <LineBadge route={route.route} color={route.color} textColor={readableTextColor(route.color)} size={28} label={`${MODES[board.mode].lineNoun} ${route.route}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{route.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {MODES[board.mode].label} · {board.regionName}
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
