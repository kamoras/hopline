"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import type { BoardLink, Focus } from "@/domain/board";
import { isDelayed } from "@/domain/delay";
import { MODES, type Mode, type ModeInfo } from "@/domain/modes";
import { operatorName } from "@/domain/operators";
import { nearestPlaces, type Place } from "@/domain/place";
import type { Region } from "@/domain/region";
import type { ProviderStatus, Snapshot, Trip } from "@/domain/trip";
import { useCommutes } from "@/hooks/use-commutes";
import { useFocus } from "@/hooks/use-focus";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useLineStatus } from "@/hooks/use-line-status";
import { useLines } from "@/hooks/use-lines";
import { useRememberBoard } from "@/hooks/use-last-board";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useNow } from "@/hooks/use-now";
import { usePinned } from "@/hooks/use-pinned";
import { useTrips } from "@/hooks/use-trips";
import { formatAgo } from "@/lib/format";
import { describeIntent, describeLeg, parseIntent, type Route } from "@/lib/query";
import { pinKey, searchTrips, type Filters, type Match } from "@/lib/search";
import { BoardSwitcher } from "./board-switcher";
import { Commutes } from "./commutes";
import { ArrivalsSheet } from "./arrivals-sheet";
import { LineStatusSheet } from "./line-status-sheet";
import { LineStatusStrip } from "./line-status-strip";
import { PlaceSheet } from "./place-sheet";
import { SearchBox } from "./search-box";
import { StationList } from "./station-list";
import { TripCard } from "./trip-card";
import { TripDetail } from "./trip-detail";

const TripMap = dynamic(() => import("./map/trip-map"), {
  ssr: false,
  loading: () => <div className="grid h-full w-full place-items-center bg-surface-2 text-sm text-muted">Loading map…</div>,
});

type View = "list" | "map";

interface Props {
  mode: Mode;
  region: Region;
  /** This board's path, e.g. /rail/northeast. */
  href: string;
  /** Every board available, for the switcher. */
  boards: BoardLink[];
  places: Place[];
  initialFocus: Focus;
  initial: Snapshot;
}

export function Board({ mode, region, href, boards, places, initialFocus, initial }: Props) {
  const vocab = MODES[mode];
  const stationsFirst = vocab.browse === "stations";
  const status = useLineStatus(mode, region.id, stationsFirst);
  const [statusRoute, setStatusRoute] = useState<string>();
  const boardKey = href.slice(1);
  const { snapshot, error, isValidating, refresh } = useTrips(mode, region.id, initial);
  const now = useNow(initial.generatedAt);
  const { pinned, toggle } = usePinned();
  const { commutes, isSaved, toggle: toggleCommute } = useCommutes(boardKey);
  const { focus, openTrip, openPlace, close } = useFocus(href, initialFocus);
  const geo = useGeolocation();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  useRememberBoard(href);

  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");
  const [operator, setOperator] = useState("all");
  const [delayedOnly, setDelayedOnly] = useState(false);

  const deferredQuery = useDeferredValue(query);
  const filters: Filters = useMemo(() => ({ query: deferredQuery, operator, delayedOnly }), [deferredQuery, operator, delayedOnly]);
  const intent = useMemo(() => parseIntent(query), [query]);
  const understood = query ? describeIntent(intent) : undefined;
  const allSaved = intent.legs.length > 0 && intent.legs.every(isSaved);

  const matches = useMemo(
    () => searchTrips(snapshot.trips, filters, { aliases: region.aliases, now }),
    [snapshot.trips, filters, region.aliases, now],
  );
  const mine = useMemo(() => (query ? [] : matches.filter((m) => pinned.includes(pinKey(m.trip)))), [matches, pinned, query]);
  const rest = useMemo(() => (query ? matches : matches.filter((m) => !mine.includes(m))), [matches, mine, query]);

  // A round trip shows each direction as its own list; everything else is one list.
  const groups = useMemo(
    () =>
      intent.legs.length > 1
        ? intent.legs.map((leg, i) => ({ title: describeLeg(leg), items: rest.filter((m) => m.leg === i) }))
        : [{ title: undefined, items: rest }],
    [intent.legs, rest],
  );

  const selected = snapshot.trips.find((t) => pinKey(t) === focus.tripKey);
  const selectedPlace = places.find((p) => p.id === focus.placeId);
  const mapTrips = useMemo(() => matches.map((m) => m.trip), [matches]);
  const delayedCount = useMemo(() => snapshot.trips.filter(isDelayed).length, [snapshot.trips]);
  const down = snapshot.providers.filter((p) => !p.ok);
  const quiet = snapshot.providers.filter((p) => p.ok && p.tripCount === 0);
  const operators = useMemo(() => [...new Set(snapshot.trips.map((t) => t.operatorId))].sort(), [snapshot.trips]);
  const nearby = useMemo(() => (geo.state.status === "ready" ? nearestPlaces(places, geo.state.at) : []), [geo.state, places]);

  const togglePin = useCallback((t: Trip) => toggle(pinKey(t)), [toggle]);
  const openTripOnMap = useCallback(() => setView("map"), []);
  const openTripById = useCallback((id: string) => {
    const t = snapshot.trips.find((x) => x.id === id);
    if (t) openTrip(pinKey(t));
  }, [snapshot.trips, openTrip]);
  const showRoute = useCallback((r: Route) => {
    setQuery(`${r.from} to ${r.to}`);
    setView("list");
  }, []);

  const showMap = isDesktop || view === "map";
  const lines = useLines(mode, region.id, showMap);
  const showList = isDesktop || view === "list";

  const card = (m: Match) => (
    <TripCard
      key={m.trip.id}
      trip={m.trip}
      stop={m.stop}
      to={m.to}
      region={region}
      now={now}
      pinned={pinned.includes(pinKey(m.trip))}
      onSelect={() => openTrip(pinKey(m.trip))}
      onTogglePin={togglePin}
    />
  );

  return (
    <div className="flex h-dvh flex-col">
      <header className="z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Link href="/" aria-label="Hopline home" className="grid h-8 w-8 place-items-center rounded-xl bg-accent text-lg font-black text-on-accent">
              h
            </Link>
            <h1 className="contents">
              <BoardSwitcher mode={mode} regionId={region.id} boards={boards} />
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={refresh}
              className="tabular flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted"
              title="Refresh"
            >
              <span className={`h-2 w-2 rounded-full ${error || down.length === snapshot.providers.length ? "bg-bad" : "bg-ok live-dot"}`} aria-hidden />
              <span className="whitespace-nowrap">{error ? "Reconnecting…" : isValidating ? "Updating…" : formatAgo(snapshot.generatedAt, now)}</span>
            </button>
            <div className="flex rounded-full border border-line bg-surface p-0.5 lg:hidden" role="tablist" aria-label="View">
              {(["list", "map"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-full px-3.5 py-1 text-sm font-semibold capitalize ${view === v ? "bg-accent text-on-accent" : "text-muted"}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1">
        {showList && (
          <main className="flex min-h-0 w-full flex-col lg:w-[460px] lg:shrink-0 lg:border-r lg:border-line">
            <div className="space-y-3 px-4 pt-4 pb-3">
              <SearchBox
                value={query}
                onChange={setQuery}
                placeholder={vocab.searchPlaceholder}
                label={`Search by ${vocab.numberLabel.toLowerCase()} number or ${vocab.stopNoun}`}
                places={places}
                onPickPlace={openPlace}
              />
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm whitespace-nowrap [scrollbar-width:none]">
                {!stationsFirst && (
                  <>
                    <Chip active={operator === "all"} onClick={() => setOperator("all")}>
                      All
                    </Chip>
                    {operators.map((id) => (
                      <Chip key={id} active={operator === id} onClick={() => setOperator(id)}>
                        {operatorName(id)}
                      </Chip>
                    ))}
                  </>
                )}
                {vocab.reportsDelay && (
                  <Chip active={delayedOnly} onClick={() => setDelayedOnly((v) => !v)}>
                    Delayed{delayedCount ? ` · ${delayedCount}` : ""}
                  </Chip>
                )}
                <Chip active={geo.state.status === "ready"} onClick={geo.request}>
                  {geo.state.status === "asking" ? "Locating…" : geo.state.status === "denied" ? "Location unavailable" : `◎ Near me`}
                </Chip>
              </div>
              {nearby.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm" aria-label={`Nearest ${vocab.stopNoun}s`}>
                  <span className="text-muted">Nearest:</span>
                  {nearby.map(({ place, miles }) => (
                    <button
                      key={place.id}
                      type="button"
                      onClick={() => openPlace(place.id)}
                      className="rounded-full border border-line bg-surface px-3 py-1 font-medium hover:border-accent/60"
                    >
                      {place.name} <span className="tabular text-muted">{miles < 0.1 ? "<0.1" : miles.toFixed(1)} mi</span>
                    </button>
                  ))}
                </div>
              )}
              {down.length > 0 && (
                <p className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn" role="status">
                  {down.map((p) => p.name).join(" and ")} data is temporarily unavailable
                  {down.length < snapshot.providers.length ? "; showing what we have." : "."}
                </p>
              )}
              {quiet.length > 0 && down.length === 0 && (
                <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted" role="status">
                  {quiet.map((p) => p.name).join(" and ")} responded but reported no {vocab.nounPlural} right now.{" "}
                  <Link href="/status" className="font-semibold text-text underline">
                    Details
                  </Link>
                </p>
              )}
              {focus.tripKey && !selected && (
                <p className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted" role="status">
                  That {vocab.noun} isn&apos;t running right now.
                  <button type="button" onClick={close} className="font-semibold text-text">
                    Dismiss
                  </button>
                </p>
              )}
              {understood && (
                <p className="px-1 text-sm text-muted" role="status">
                  Showing <span className="font-semibold text-text">{understood}</span>
                </p>
              )}
              {intent.legs.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleCommute(intent.legs)}
                  aria-pressed={allSaved}
                  className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold ${allSaved ? "bg-accent text-on-accent" : "border border-line bg-surface hover:bg-surface-2"}`}
                >
                  {allSaved ? "⇄ Saved to My commutes" : intent.roundTrip ? "⇄ Save this round trip" : "⇄ Save this commute"}
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
              {stationsFirst && !query && (
                <div className="mb-4">
                  <LineStatusStrip lines={status.lines} unavailable={status.unavailable} loading={status.isLoading} onOpen={setStatusRoute} />
                </div>
              )}
              {stationsFirst ? (
                <StationList places={places} query={query} vocab={vocab} onPick={openPlace} />
              ) : (
                <>
                {!query && (
                  <Commutes
                    commutes={commutes}
                    trips={snapshot.trips}
                    region={region}
                    aliases={region.aliases}
                    now={now}
                    onOpenTrip={openTrip}
                    onOpenRoute={showRoute}
                    onRemove={toggleCommute}
                  />
                )}
                {mine.length > 0 && (
                  <section aria-label={`My ${vocab.nounPlural}`} className="mb-5">
                    <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">★ My {vocab.nounPlural}</h2>
                    <ul className="space-y-2.5">{mine.map(card)}</ul>
                  </section>
                )}
                {rest.length > 0 ? (
                  groups.map((g, i) => (
                    <section key={g.title ?? i} aria-label={g.title ?? vocab.label} className="mb-5">
                      <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                        {g.title ??
                          (query ? `${rest.length} match${rest.length === 1 ? "" : "es"}` : mine.length ? `All ${vocab.nounPlural}` : `${vocab.label} right now`)}
                      </h2>
                      {g.items.length > 0 ? (
                        <ul className="space-y-2.5">{g.items.map(card)}</ul>
                      ) : (
                        <p className="text-sm text-muted">No {vocab.nounPlural} on this leg right now.</p>
                      )}
                    </section>
                  ))
                ) : (
                  mine.length === 0 && <EmptyState vocab={vocab} hasQuery={!!query} allDown={down.length === snapshot.providers.length} />
                )}
                </>
              )}
              <Footer providers={snapshot.providers} reportsDelay={vocab.reportsDelay} />
            </div>
          </main>
        )}

        {showMap && (
          <section aria-label="Map" className="relative min-h-0 flex-1">
            <TripMap
              region={region}
              trips={mapTrips}
              places={places}
              lines={lines}
              showDelays={vocab.reportsDelay}
              selectedTripId={selected?.id}
              selectedPlaceId={selectedPlace?.id}
              onSelectTrip={openTripById}
              onSelectPlace={openPlace}
            />
          </section>
        )}
      </div>

      {selected ? (
        <TripDetail
          trip={selected}
          region={region}
          now={now}
          pinned={pinned.includes(pinKey(selected))}
          showMapButton={!isDesktop && view === "list"}
          onClose={close}
          onTogglePin={() => togglePin(selected)}
          onShowOnMap={openTripOnMap}
        />
      ) : (
        selectedPlace &&
        (stationsFirst ? (
          <ArrivalsSheet mode={mode} regionId={region.id} place={selectedPlace} now={now} lineStatus={status.lines} onClose={close} />
        ) : (
          <PlaceSheet
            place={selectedPlace}
            trips={snapshot.trips}
            places={places}
            region={region}
            onClose={close}
            onOpenTrip={openTrip}
            onPickRoute={(from, to) => {
              close();
              showRoute({ from: from.name.toLowerCase(), to: to.name.toLowerCase() });
            }}
          />
        ))
      )}
      {statusRoute && !selected && !selectedPlace && status.lines.find((l) => l.route === statusRoute) && (
        <LineStatusSheet line={status.lines.find((l) => l.route === statusRoute)!} onClose={() => setStatusRoute(undefined)} />
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 py-1.5 font-medium transition ${
        active ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ vocab, hasQuery, allDown }: { vocab: ModeInfo; hasQuery: boolean; allDown: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-8 text-center">
      <p className="text-lg font-semibold">
        {hasQuery ? `No ${vocab.nounPlural} match` : allDown ? "Live data is unavailable" : `No ${vocab.nounPlural} running right now`}
      </p>
      <p className="mt-1 text-sm text-muted">
        {hasQuery ? vocab.searchHint : allDown ? "We'll keep retrying automatically." : "Service may be between schedules. Check back soon."}
      </p>
    </div>
  );
}

function Footer({ providers, reportsDelay }: { providers: ProviderStatus[]; reportsDelay: boolean }) {
  const sources = providers.map((p) => p.attribution);
  return (
    <footer className="mt-8 space-y-1.5 text-xs text-muted">
      <p>
        Data from{" "}
        {sources.map((a, i) => (
          <span key={a.url}>
            {i > 0 && ", "}
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-text">
              {a.label}
            </a>
          </span>
        ))}
        .{reportsDelay && " Delay reasons come from the operator when published; otherwise we only show where time was lost."}
      </p>
      {sources.map((a) => a.notice && <p key={a.url}>{a.notice}</p>)}
      <p>
        No accounts or cookies. Page views are counted anonymously (Vercel Analytics); saved items and your location never leave this device.{" "}
        <Link href="/status" className="underline hover:text-text">
          Data status
        </Link>
      </p>
    </footer>
  );
}
