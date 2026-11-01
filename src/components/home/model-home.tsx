"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { BRAND } from "@/brand";
import type { BoardLink } from "@/domain/board";
import type { Trip } from "@/domain/trip";
import { useMediaQuery } from "@/hooks/use-media-query";
import { MODES, type Mode } from "@/domain/modes";
import { NORTHEAST, type Region } from "@/domain/region";
import { useNow } from "@/hooks/use-now";
import { useWorld } from "@/hooks/use-world";
import { boundsOfBoards, parseWorldPlaceId, worldPlaceId, type WorldView } from "@/lib/world";
import { Logo } from "../brand/logo";
import type { MapView } from "../map/trip-map";
import { Drawer, drawerPadding } from "./drawer";
import { PlaceDrawer } from "./place-drawer";
import { SearchBar } from "./search-bar";
import { SearchDrawer } from "./search-drawer";
import { TripDrawer } from "./trip-drawer";
import { ResumeCard } from "./resume-card";

const TripMap = dynamic(() => import("../map/trip-map"), {
  ssr: false,
  loading: () => <div className="grid h-full w-full place-items-center bg-surface-2 text-sm text-muted">Loading the map…</div>,
});

/** A station or airport the person asked about: enough to fly there and ask its board, even before its board is drawn. */
export interface PlaceTarget {
  /** The id on its own board. */
  id: string;
  name: string;
  mode: Mode;
  regionId: string;
  lat: number;
  lon: number;
}

type Drawn = { kind: "search" } | { kind: "trip"; id: string } | { kind: "place"; place: PlaceTarget };

/**
 * Home: one live model of transit, and the whole app. Everything that is moving, drawn as a calm diagram you can pan
 * and zoom. Tap a vehicle and a drawer opens with everything about it and its route while the camera follows it; search
 * opens a drawer of results; a station opens what is due there. Nothing sends you to another page.
 */
export function ModelHome({ boards }: { boards: BoardLink[] }) {
  const [view, setView] = useState<WorldView>();
  const [modes, setModes] = useState<ReadonlySet<Mode>>(() => new Set(boards.map((b) => b.mode)));
  const [drawn, setDrawn] = useState<Drawn>();
  const [following, setFollowing] = useState(false);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<{ lat: number; lon: number; zoom: number; key: string }>();
  const world = useWorld(boards, view, modes);
  const now = useNow(0);
  const wide = useMediaQuery("(min-width: 1024px)");

  // The first view holds the networks that are small enough to show whole (trains, metros, flights); after that the person is in charge.
  const region = useMemo<Region>(() => ({ ...NORTHEAST, id: "world", name: "Everywhere", bounds: [...boundsOfBoards(boards.some((b) => !MODES[b.mode].viewport) ? boards.filter((b) => !MODES[b.mode].viewport) : boards)] as Region["bounds"], zoom: 5 }), [boards]);
  const onViewChange = useCallback((v: MapView) => setView({ bbox: v.bbox, zoom: v.zoom }), []);

  const openTrip = useCallback((id: string) => {
    setDrawn({ kind: "trip", id });
    setFollowing(true);
    setQuery("");
  }, []);
  const openPlace = useCallback((place: PlaceTarget) => {
    setDrawn({ kind: "place", place });
    setFollowing(false);
    setQuery("");
    setFocus({ lat: place.lat, lon: place.lon, zoom: 12.5, key: `${place.mode}/${place.regionId}/${place.id}/${Date.now()}` });
  }, []);
  const onSelectPlace = useCallback(
    (worldId: string) => {
      const p = world.places.find((x) => x.id === worldId);
      const parsed = parseWorldPlaceId(worldId);
      if (p && parsed) openPlace({ id: parsed.placeId, name: p.name, mode: parsed.mode, regionId: parsed.regionId, lat: p.lat, lon: p.lon });
    },
    [world.places, openPlace],
  );
  const close = useCallback(() => {
    setDrawn(undefined);
    setFollowing(false);
    setQuery("");
  }, []);
  const onQuery = useCallback((q: string) => {
    setQuery(q);
    setDrawn((d) => (q.trim() ? { kind: "search" } : d?.kind === "search" ? undefined : d));
    if (q.trim()) setFollowing(false);
  }, []);
  const onFollowEnd = useCallback(() => setFollowing(false), []);

  // The vehicle in the drawer. If it leaves the feed (its run ended), the drawer keeps what it last knew.
  const [known, setKnown] = useState<{ trip: Trip; board: BoardLink }>();
  const live = drawn?.kind === "trip" ? world.trips.find((t) => t.id === drawn.id) : undefined;
  const liveBoard = live && world.boardOfTrip.get(live.id);
  if (live && liveBoard && known?.trip !== live) setKnown({ trip: live, board: liveBoard });
  const shownTrip = drawn?.kind === "trip" && known?.trip.id === drawn.id ? known : undefined;

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

  const open = !!drawn;
  const padding = useMemo(() => drawerPadding(open, wide, typeof window === "undefined" ? 800 : window.innerHeight), [open, wide]);
  const selectedPlaceId = drawn?.kind === "place" ? worldPlaceId(drawn.place, drawn.place.id) : undefined;

  return (
    <main>
      <section aria-label="Live map of transit" className={`relative h-[100dvh] min-h-[560px] overflow-hidden ${open ? "lg:[&_.maplibregl-ctrl-bottom-right]:right-[400px]" : ""}`}>
        <TripMap
          region={region}
          trips={world.trips}
          places={world.places}
          lines={world.lines}
          frameTrips={false}
          living
          controlsPosition="bottom-right"
          legendClassName={`bottom-6 left-3 sm:left-auto ${open ? "lg:right-[464px] sm:right-16" : "sm:right-16"}`}
          onViewChange={onViewChange}
          selectedTripId={drawn?.kind === "trip" ? drawn.id : undefined}
          selectedPlaceId={selectedPlaceId}
          followTripId={drawn?.kind === "trip" && following ? drawn.id : undefined}
          onFollowEnd={onFollowEnd}
          focus={focus}
          padding={padding}
          onSelectTrip={openTrip}
          onSelectPlace={onSelectPlace}
        />

        <div className={`pointer-events-none absolute inset-x-0 top-0 z-10 space-y-2.5 p-3 sm:p-4 ${open ? "lg:pr-[416px]" : ""}`}>
          <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-3">
            <div className="hidden shrink-0 rounded-2xl border border-line bg-surface/95 px-3 py-2 shadow-card backdrop-blur sm:block">
              <Logo size={30} />
            </div>
            <div className="min-w-0 flex-1">
              <SearchBar value={query} onChange={onQuery} placeholder="Where's my train, bus or flight? Station, route, airport…" />
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

        {drawn?.kind === "search" && (
          <Drawer label="Search results" onClose={close}>
            <SearchDrawer query={query} trips={world.trips} places={world.places} onOpenTrip={openTrip} onOpenPlace={openPlace} />
          </Drawer>
        )}
        {shownTrip && (
          <Drawer label={`${MODES[shownTrip.trip.mode].numberLabel} ${shownTrip.trip.number}`} onClose={close}>
            <TripDrawer trip={shownTrip.trip} gone={!live} board={shownTrip.board} now={now} following={following} onFollow={() => setFollowing(true)} />
          </Drawer>
        )}
        {drawn?.kind === "place" && (
          <Drawer label={drawn.place.name} onClose={close}>
            <PlaceDrawer place={drawn.place} trips={world.trips} now={now} onOpenTrip={openTrip} />
          </Drawer>
        )}
      </section>

      <section aria-label="All boards" className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{BRAND.name}: {BRAND.tagline}</h1>
          <p className="text-muted">{BRAND.coverage}</p>
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
