"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { BRAND } from "@/brand";
import type { BoardLink } from "@/domain/board";
import { MODES, type Mode } from "@/domain/modes";
import { NORTHEAST, type Region } from "@/domain/region";
import { useNow } from "@/hooks/use-now";
import { useWorld } from "@/hooks/use-world";
import { boundsOfBoards, parseWorldPlaceId, type WorldView } from "@/lib/world";
import { Logo } from "../brand/logo";
import type { MapView } from "../map/trip-map";
import { HomeSearch } from "./home-search";
import { ModelPeek } from "./model-peek";
import { ResumeCard } from "./resume-card";

const TripMap = dynamic(() => import("../map/trip-map"), {
  ssr: false,
  loading: () => <div className="grid h-full w-full place-items-center bg-surface-2 text-sm text-muted">Loading the map…</div>,
});

/**
 * Home: one live model of transit. Everything that is moving, drawn as a calm diagram you can pan and zoom, with
 * the answer to "where's my train, bus or flight" always one tap away: search it, or tap it on the map.
 */
export function ModelHome({ boards }: { boards: BoardLink[] }) {
  const [view, setView] = useState<WorldView>();
  const [modes, setModes] = useState<ReadonlySet<Mode>>(() => new Set(boards.map((b) => b.mode)));
  const [selected, setSelected] = useState<{ kind: "trip" | "place"; id: string }>();
  const world = useWorld(boards, view, modes);
  const now = useNow(0);

  // The first view holds the networks that are small enough to show whole (trains, metros, flights); after that the person is in charge.
  const region = useMemo<Region>(() => ({ ...NORTHEAST, id: "world", name: "Everywhere", bounds: [...boundsOfBoards(boards.some((b) => !MODES[b.mode].viewport) ? boards.filter((b) => !MODES[b.mode].viewport) : boards)] as Region["bounds"], zoom: 5 }), [boards]);
  const onViewChange = useCallback((v: MapView) => setView({ bbox: v.bbox, zoom: v.zoom }), []);
  const onSelectTrip = useCallback((id: string) => setSelected({ kind: "trip", id }), []);
  const onSelectPlace = useCallback((id: string) => setSelected({ kind: "place", id }), []);
  const close = useCallback(() => setSelected(undefined), []);

  const peek = useMemo(() => {
    if (!selected) return undefined;
    if (selected.kind === "trip") {
      const trip = world.trips.find((t) => t.id === selected.id);
      const board = trip && world.boardOfTrip.get(trip.id);
      return trip && board ? ({ kind: "trip", trip, board } as const) : undefined;
    }
    const worldPlace = world.places.find((p) => p.id === selected.id);
    const parsed = parseWorldPlaceId(selected.id);
    const board = parsed && boards.find((b) => b.mode === parsed.mode && b.regionId === parsed.regionId);
    return worldPlace && parsed && board ? ({ kind: "place", place: { ...worldPlace, id: parsed.placeId }, board } as const) : undefined;
  }, [selected, world.trips, world.places, world.boardOfTrip, boards]);

  const toggle = (m: Mode) =>
    setModes((cur) => {
      const next = new Set(cur);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  const allModes = [...new Set(boards.map((b) => b.mode))];
  const moving = Object.values(world.counts).reduce((a, b) => a + b, 0);
  const zoomedOutBuses = allModes.includes("bus") && modes.has("bus") && view && view.zoom < 12;

  return (
    <main>
      <section aria-label="Live map of transit" className="relative h-[100dvh] min-h-[560px] overflow-hidden">
        <TripMap
          region={region}
          trips={world.trips}
          places={world.places}
          lines={world.lines}
          frameTrips={false}
          living
          controlsPosition="bottom-right"
          legendClassName="bottom-6 left-3 sm:left-auto sm:right-16"
          onViewChange={onViewChange}
          selectedTripId={selected?.kind === "trip" ? selected.id : undefined}
          selectedPlaceId={selected?.kind === "place" ? selected.id : undefined}
          onSelectTrip={onSelectTrip}
          onSelectPlace={onSelectPlace}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 space-y-2.5 p-3 sm:p-4">
          <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-3">
            <div className="hidden shrink-0 rounded-2xl border border-line bg-surface/95 px-3 py-2 shadow-card backdrop-blur sm:block">
              <Logo size={30} />
            </div>
            <div className="min-w-0 flex-1">
              <HomeSearch floating placeholder="Where's my train, bus or flight? Station, route, airport…" />
            </div>
          </div>
          <div className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center gap-2" role="group" aria-label="Show on the map">
            {allModes.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={modes.has(m)}
                onClick={() => toggle(m)}
                className={`press rounded-full border px-3.5 py-1.5 text-sm font-semibold shadow-card backdrop-blur ${modes.has(m) ? "border-accent bg-accent text-on-accent" : "border-line bg-surface/95 text-muted"}`}
              >
                {MODES[m].label}
                {modes.has(m) && world.counts[m] ? <span className="tabular ml-1.5 font-medium">{world.counts[m]}</span> : null}
              </button>
            ))}
            <span role="status" className="tabular ml-auto rounded-full border border-line bg-surface/95 px-3 py-1.5 text-sm text-muted shadow-card backdrop-blur">
              {moving > 0 ? `${moving.toLocaleString("en-US")} moving right now` : "Zoom in to see more"}
            </span>
          </div>
          {zoomedOutBuses && (
            <p className="pointer-events-none mx-auto max-w-3xl text-center text-xs text-muted">Buses appear when you zoom in to a neighborhood.</p>
          )}
        </div>

        {peek && <ModelPeek selection={peek} now={now} onClose={close} />}
      </section>

      <section aria-label="All boards" className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{BRAND.name}: {BRAND.tagline}</h1>
          <p className="text-muted">{BRAND.coverage} Prefer a list? Pick a place.</p>
        </header>
        <ResumeCard boards={boards} />
        <BoardList boards={boards} />
      </section>
    </main>
  );
}

function BoardList({ boards }: { boards: BoardLink[] }) {
  const byMode = Object.groupBy(boards, (b) => b.mode);
  return (
    <div className="space-y-6">
      {Object.entries(byMode).map(([mode, list]) => (
        <section key={mode} aria-label={MODES[mode as Mode].label}>
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{MODES[mode as Mode].label}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {list?.map((b) => (
              <li key={b.href}>
                <Link href={b.href} className="block rounded-2xl border border-line bg-surface p-4 font-semibold shadow-card hover:border-accent/50 hover:shadow-lift">
                  {b.regionName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
