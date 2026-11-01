"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BRAND } from "@/brand";
import type { BoardLink } from "@/domain/board";
import type { Trip } from "@/domain/trip";
import type { RouteSummary } from "@/server/routes";
import { useAllCommutes } from "@/hooks/use-commutes";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePinned } from "@/hooks/use-pinned";
import { nearestPlaces } from "@/domain/place";
import { MODES, type Mode } from "@/domain/modes";
import { NORTHEAST, type Region } from "@/domain/region";
import { useNow } from "@/hooks/use-now";
import { useWorld } from "@/hooks/use-world";
import { TRAFFIC_MIN_ZOOM } from "@/lib/traffic";
import { linkHref, parseLink, type Link as DeepLink } from "@/lib/deeplink";
import { pinKey } from "@/lib/search";
import { boundsOfBoards, parseWorldPlaceId, sameBoard, worldPlaceId, type WorldView } from "@/lib/world";
import { Logo } from "../brand/logo";
import type { MapView } from "../map/trip-map";
import { Drawer, drawerPadding } from "./drawer";
import { HomeDrawer } from "./home-drawer";
import { PlaceDrawer } from "./place-drawer";
import { RouteDrawer } from "./route-drawer";
import { SearchBar } from "./search-bar";
import { SearchDrawer } from "./search-drawer";
import { TripDrawer } from "./trip-drawer";

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

type Drawn = { kind: "search" } | { kind: "trip"; id: string } | { kind: "place"; place: PlaceTarget } | { kind: "route" };

/** A route of a big network the person is following: all of it is on the map. */
interface Followed {
  board: BoardLink;
  route: RouteSummary;
}

/**
 * Home: one live model of transit, and the whole app. Everything that is moving, drawn as a calm diagram you can pan
 * and zoom. Tap a vehicle and a drawer opens with everything about it and its route while the camera follows it; search
 * opens a drawer of results; a station opens what is due there. Nothing sends you to another page.
 */
export function ModelHome({ boards, trafficAvailable = false }: { boards: BoardLink[]; trafficAvailable?: boolean }) {
  // What the address asked to open (a shared link): read once, in the browser. Nothing is stored or sent.
  const [initial] = useState<DeepLink | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const q = new URLSearchParams(window.location.search);
    return parseLink({ trip: q.get("trip") ?? undefined, board: q.get("board") ?? undefined, place: q.get("place") ?? undefined, route: q.get("route") ?? undefined });
  });
  const [view, setView] = useState<WorldView>();
  const [modes, setModes] = useState<ReadonlySet<Mode>>(() => new Set(boards.map((b) => b.mode)));
  const [drawn, setDrawn] = useState<Drawn>();
  const [following, setFollowing] = useState(false);
  const [traffic, setTraffic] = useState(true);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<{ lat: number; lon: number; zoom: number; key: string }>();
  const [routeFollowed, setRouteFollowed] = useState<Followed>();
  const routeFocus = useMemo(() => routeFollowed && { board: routeFollowed.board, route: routeFollowed.route.route }, [routeFollowed]);
  const world = useWorld(boards, view, modes, routeFocus);
  const now = useNow(0);
  const wide = useMediaQuery("(min-width: 1024px)");
  const { pinned, toggle: togglePin } = usePinned();
  const commutes = useAllCommutes();
  const geo = useGeolocation();
  const boardKeyOf = useCallback((tripId: string) => {
    const b = world.boardOfTrip.get(tripId);
    return b && `${b.mode}/${b.regionId}`;
  }, [world.boardOfTrip]);

  // The first view holds the networks that are small enough to show whole (trains, metros, flights); after that the person is in charge.
  const region = useMemo<Region>(() => {
    // A shared link starts at its board; otherwise everything small enough to see whole.
    const linked = initial && boards.find((b) => b.mode === initial.mode && b.regionId === initial.regionId);
    const shown = linked ? [linked] : boards.some((b) => !MODES[b.mode].viewport) ? boards.filter((b) => !MODES[b.mode].viewport) : boards;
    return { ...NORTHEAST, id: "world", name: "Everywhere", bounds: [...boundsOfBoards(shown)] as Region["bounds"], zoom: 5 };
  }, [boards, initial]);
  const onViewChange = useCallback((v: MapView) => setView({ bbox: v.bbox, zoom: v.zoom }), []);

  const openTrip = useCallback((id: string) => {
    setDrawn({ kind: "trip", id });
    setFollowing(true);
    setQuery("");
  }, []);
  const openPlace = useCallback((place: PlaceTarget) => {
    setRouteFollowed(undefined);
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
  const openRoute = useCallback((board: BoardLink, route: RouteSummary) => {
    setRouteFollowed({ board, route });
    setDrawn({ kind: "route" });
    setFollowing(false);
    setQuery("");
  }, []);
  const close = useCallback(() => {
    setRouteFollowed(undefined);
    setDrawn(undefined);
    setFollowing(false);
    setQuery("");
  }, []);
  const onQuery = useCallback((q: string) => {
    setQuery(q);
    setDrawn((d) => (q.trim() ? { kind: "search" } : d));
    if (q.trim()) {
      setFollowing(false);
      setRouteFollowed(undefined);
    }
  }, []);
  const openHome = useCallback(() => setDrawn((d) => d ?? { kind: "search" }), []);
  const nearMe = useCallback(() => {
    geo.request((at) => setFocus({ lat: at.lat, lon: at.lon, zoom: 13, key: `near/${Date.now()}` }));
  }, [geo]);
  const onFollowEnd = useCallback(() => setFollowing(false), []);

  // The vehicle in the drawer. If it leaves the feed (its run ended), the drawer keeps what it last knew.
  const [known, setKnown] = useState<{ trip: Trip; board: BoardLink }>();
  const live = drawn?.kind === "trip" ? world.trips.find((t) => t.id === drawn.id) : undefined;
  const liveBoard = live && world.boardOfTrip.get(live.id);
  if (live && liveBoard && known?.trip !== live) setKnown({ trip: live, board: liveBoard });
  const shownTrip = drawn?.kind === "trip" && known?.trip.id === drawn.id ? known : undefined;

  // Open what a shared link asked for, once what it points at has loaded. If it is gone (a trip that has ended), the
  // map simply starts at its board.
  const [opened, setOpened] = useState(false);
  if (!opened && initial?.kind === "trip") {
    const t = world.trips.find((x) => pinKey(x) === initial.key);
    if (t) {
      setOpened(true);
      setDrawn({ kind: "trip", id: t.id });
      setFollowing(true);
    }
  } else if (!opened && initial?.kind === "place") {
    const board = boards.find((b) => sameBoard(b, initial));
    const p = board && world.places.find((x) => x.id === worldPlaceId(board, initial.placeId));
    if (board && p) {
      setOpened(true);
      setDrawn({ kind: "place", place: { id: initial.placeId, name: p.name, mode: board.mode, regionId: board.regionId, lat: p.lat, lon: p.lon } });
      setFocus({ lat: p.lat, lon: p.lon, zoom: 12.5, key: `link/${initial.placeId}` });
    }
  }
  const routeLinked = useRef(false);
  useEffect(() => {
    if (routeLinked.current || initial?.kind !== "route") return;
    routeLinked.current = true;
    const board = boards.find((b) => sameBoard(b, initial));
    if (!board) return;
    fetch(`/api/routes?mode=${board.mode}&region=${board.regionId}&q=${encodeURIComponent(initial.route)}`)
      .then((res) => (res.ok ? (res.json() as Promise<RouteSummary[]>) : []))
      .then((found) => {
        const route = found.find((x) => x.route.toLowerCase() === initial.route.toLowerCase());
        if (route) openRoute(board, route);
      })
      .catch(() => {});
  }, [initial, boards, openRoute]);

  // The address follows what is open, so it can be shared or reloaded.
  const address = useMemo<string>(() => {
    if (drawn?.kind === "trip" && shownTrip) return linkHref({ kind: "trip", key: pinKey(shownTrip.trip), mode: shownTrip.board.mode, regionId: shownTrip.board.regionId });
    if (drawn?.kind === "place") return linkHref({ kind: "place", mode: drawn.place.mode, regionId: drawn.place.regionId, placeId: drawn.place.id });
    if (drawn?.kind === "route" && routeFollowed) return linkHref({ kind: "route", mode: routeFollowed.board.mode, regionId: routeFollowed.board.regionId, route: routeFollowed.route.route });
    return linkHref(undefined);
  }, [drawn, shownTrip, routeFollowed]);
  useEffect(() => {
    // Until a shared link has opened, leave its address alone.
    if (initial && !opened && !routeLinked.current && !drawn) return;
    window.history.replaceState(window.history.state, "", address);
  }, [address, drawn, initial, opened]);

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
          trafficAvailable={trafficAvailable}
          traffic={traffic}
          living
          controlsPosition="bottom-right"
          legendClassName={`bottom-6 left-3 sm:left-auto ${open ? "lg:right-[464px] sm:right-16" : "sm:right-16"}`}
          onViewChange={onViewChange}
          selectedTripId={drawn?.kind === "trip" ? drawn.id : undefined}
          selectedPlaceId={selectedPlaceId}
          followTripId={drawn?.kind === "trip" && following ? drawn.id : undefined}
          onFollowEnd={onFollowEnd}
          focus={focus}
          fitTo={routeFollowed && world.routeLines.length ? { key: `${routeFollowed.board.href}/${routeFollowed.route.route}`, lines: world.routeLines } : undefined}
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
              <SearchBar value={query} onChange={onQuery} onFocus={openHome} placeholder="Where's my train, bus or flight? Station, route, airport…" />
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
            {trafficAvailable && (
              <button
                type="button"
                aria-pressed={traffic}
                onClick={() => setTraffic((t) => !t)}
                title={traffic ? "Road traffic on: green flowing, red slow (data from TomTom)" : "Show road traffic"}
                className={`press rounded-full border px-3.5 py-1.5 text-sm font-semibold shadow-card backdrop-blur ${traffic ? "border-accent bg-accent text-on-accent" : "border-line bg-surface/95 text-muted"}`}
              >
                Traffic
              </button>
            )}
            <span role="status" className="tabular ml-auto rounded-full border border-line bg-surface/95 px-3 py-1.5 text-sm text-muted shadow-card backdrop-blur">
              {moving > 0 ? `${moving.toLocaleString("en-US")} moving right now` : "Zoom in to see more"}
            </span>
          </div>
          {zoomedOutBuses && (
            <p className="pointer-events-none mx-auto max-w-3xl text-center text-xs text-muted">Buses appear when you zoom in to a neighborhood.</p>
          )}
          {!zoomedOutBuses && trafficAvailable && traffic && view && view.zoom < TRAFFIC_MIN_ZOOM && (
            <p className="pointer-events-none mx-auto max-w-3xl text-center text-xs text-muted">Road traffic appears when you zoom in to a city.</p>
          )}
        </div>

        {drawn?.kind === "search" && (
          <Drawer label={query.trim() ? "Search results" : "Your places"} onClose={close}>
            {query.trim() ? (
              <SearchDrawer
                query={query}
                trips={world.trips}
                places={world.places}
                boards={boards}
                now={now}
                boardOfTrip={boardKeyOf}
                isSaved={commutes.isSaved}
                onToggleCommute={commutes.toggle}
                onOpenTrip={openTrip}
                onOpenPlace={openPlace}
                onOpenRoute={openRoute}
              />
            ) : (
              <HomeDrawer
                trips={world.trips}
                pinned={pinned}
                commutes={commutes.all}
                boardOfTrip={boardKeyOf}
                near={geo.state.status}
                nearPlaces={geo.state.status === "ready" ? nearestPlaces(world.places, geo.state.at, 5).map((n) => n.place) : []}
                now={now}
                onNearMe={nearMe}
                onOpenTrip={openTrip}
                onOpenPlace={openPlace}
                onUnpin={togglePin}
                onRemoveCommute={(c) => commutes.toggle(c.board, [c])}
                onOpenCommute={(c) => onQuery(`${c.from} to ${c.to}`)}
              />
            )}
          </Drawer>
        )}
        {shownTrip && (
          <Drawer label={`${MODES[shownTrip.trip.mode].numberLabel} ${shownTrip.trip.number}`} onClose={close}>
            <TripDrawer trip={shownTrip.trip} gone={!live} board={shownTrip.board} now={now} following={following} onFollow={() => setFollowing(true)} />
          </Drawer>
        )}
        {drawn?.kind === "route" && routeFollowed && (
          <Drawer label={`${MODES[routeFollowed.board.mode].lineNoun} ${routeFollowed.route.route}`} onClose={close}>
            <RouteDrawer board={routeFollowed.board} route={routeFollowed.route} trips={world.trips} onOpenTrip={openTrip} />
          </Drawer>
        )}
        {drawn?.kind === "place" && (
          <Drawer label={drawn.place.name} onClose={close}>
            <PlaceDrawer place={drawn.place} trips={world.trips} now={now} onOpenTrip={openTrip} onOpenPlace={openPlace} />
          </Drawer>
        )}
      </section>

      <section aria-label="All boards" className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{BRAND.name}: {BRAND.tagline}</h1>
          <p className="text-muted">{BRAND.coverage}</p>
        </header>
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
                <Link href={linkHref({ kind: "board", mode: b.mode, regionId: b.regionId })} className="block rounded-2xl border border-line bg-surface p-4 font-semibold shadow-card hover:border-accent/50 hover:shadow-lift">
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
