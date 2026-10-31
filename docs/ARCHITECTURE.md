# Architecture

```
 Upstream feeds                 Server (Next.js route handlers)               Browser
┌──────────────┐   ┌──────────────────────────────────────────┐   ┌──────────────────────┐
│ MTA GTFS-RT  │──▶│ providers/mnr     ─┐                     │   │ SWR polling (15 s)   │
│ Amtraker v3  │──▶│ providers/amtrak  ─┼─▶ server/snapshot ──┼──▶│ list · search · map  │
│ (future ...) │──▶│ providers/<new>   ─┘   (aggregate)       │   │ localStorage prefs   │
└──────────────┘   └──────────────────────────────────────────┘   └──────────────────────┘
                     domain/ (Train, Region, delay rules) is shared by all layers
```

## Layers

| Path | Responsibility |
| --- | --- |
| `src/domain` | Provider-agnostic model (`Train`, `StopCall`, `Region`) and delay rules. No I/O. |
| `src/providers/<name>` | One adapter per data source: fetch, validate, normalize to `Train`. The only place that knows an upstream format. |
| `src/providers/finalize.ts` | Derives next stop, headline delay, status bucket and inferred reason identically for every provider. |
| `src/providers/registry.ts` | The list of providers; filters by region. |
| `src/server/snapshot.ts` | Runs providers in parallel with timeouts. One failing provider degrades gracefully (reported in `providers[]`, last-good data served for 2 min). |
| `src/app/api/trips` | `GET /api/trips?mode=&region=`: public, cacheable JSON (`s-maxage=10`). Contains no user data. |
| `src/components`, `src/hooks`, `src/lib` | UI. Consumes only the `Snapshot` type. |
| `scripts/` | Build-time tooling (GTFS → compact JSON, MapLibre worker copy). |
| `data/` | Generated static schedule data, committed so cold starts are fast and there is no database. |

## Modes, regions and boards (UX model)

People come for one thing ("a flight at Bradley", "my train to Stamford"), so Hopline never
shows everything in a region. The unit of navigation is a **board**: one **mode** in one **region**.

- **Mode** (`src/domain/modes.ts`): train, flight, bus... Each carries its own vocabulary
  (labels, "train number" vs "flight number", search placeholder), so no component hard-codes a noun.
- **Region** (`src/domain/region.ts`): any geographic area with bounds and a time zone. It can be
  a rail network (`northeast`) or a single airport (`bdl`), so granularity follows the use case.
- **Board** (`src/domain/board.ts`): derived from providers, never configured. A board exists
  only where a provider serves that (mode, region), so the UI cannot offer an empty one.
- **URLs:** `/` is a chooser grouped by mode (it redirects straight to the board when only one
  exists, keeping "where's my train" one step away); each board is `/{mode}/{region}`, e.g.
  `/rail/northeast`. A header menu switches boards, grouped by mode.
- **Isolation:** the API, aggregation and cache are all keyed by (mode, region), so an Atlanta
  flight board never loads, or even fetches, New York train data.

## Ways in (navigation for different people)

Different riders want different shortcuts, so each has a path with as few taps as possible.
All state below lives in the URL or in the browser; none of it reaches a server.

| Person | Fastest path |
| --- | --- |
| Daily commuter | **My commutes** (saved "A to B") sit at the top of the board with the next departures; **My trains** pin by number and survive across days. `/` offers "Continue" to the last board. |
| Knows their train | Type the number. Or open the shareable deep link `/{mode}/{region}/trip/{operator}-{number}`. |
| Thinks in sentences | Natural language works: `new haven to new york round trip`, `trains leaving stamford to grand central right now`, `nyc`. `src/lib/query.ts` turns text into an intent (legs, round trip, time window) and region `aliases` map city names to station names; anything unrecognized falls back to number/station search. |
| Knows their station | Type it: autocomplete opens its departures (`/{mode}/{region}/stop/{place}`). Type `A to B` for trains that call at both, then save it as a commute. |
| Just arrived / unsure | **Near me** (on-device location) suggests the nearest stations; no typing. |
| Explorer | Map: tap a station for departures, tap a train to follow it. On the home page (when there are several boards) each board is a tappable bubble. |
| Visitor from a link | Deep links open straight to the trip or station; Back closes the sheet. |

Building blocks: `Place` (`src/domain/place.ts`, fetched per provider via `fetchPlaces`, merged by
normalized name), `useFocus` (URL-synced selection), `searchTrips` (number, station, route),
`/api/search` (universal search over boards and places), `BaseMap` (shared map setup).

## Key decisions

- **No database.** Everything is derived from live feeds plus static schedule files.
  Vercel's CDN absorbs read traffic. If we later need history (e.g. "usually late"),
  it would be added behind a storage interface and remain optional.
- **Honest delay reasons.** `DelayReason.kind` is `operator-reported` (alerts, cause codes) or
  `inferred` (where time was lost, from stop times). The UI labels the difference.
- **Stop timeline.** The trip sheet shows the journey, not just a list: passed stops are filled with a check and a solid line in the route's color, the train's current or next stop is highlighted with a countdown, and track ahead is dashed. Phases come from `stopPhases` (unit tested).
- **Subway (a station-first mode).** The subway is `mode: "subway"` with `browse: "stations"` and
  `reportsDelay: false` (`src/domain/modes.ts`): riders think in stations and lines, so the board lists
  stations (not hundreds of trains), trains live on the map, and no delay status is shown, because the feeds
  give arrival times but nothing to be late against. The provider (`src/providers/nyct`) reads the eight MTA
  feeds in parallel (a failed feed is skipped and reported on `/status`), gets stations, line colors and track from
  bundled data (`npm run data:subway`; stations in the same complex are merged), and estimates each train's position
  as its next stop's place on the track minus the distance it still has to cover. Station ids are supplied by the
  provider because subway names repeat ("86 St"). Station boards are served by `fetchArrivals` (optional on a
  provider): trains due at a station's platforms in the next 45 min, grouped by line and destination
  (`lib/arrivals.ts`), refreshed while the sheet is open (`/api/arrivals`), with a warning when the next train is
  15+ min away or a gap is much bigger than the usual spacing.
- **Line status.** `fetchLineStatus` (optional on a provider) turns the MTA service-alerts feed into one
  `LineStatus` per line (`good | planned | change | delays | suspended`, `src/providers/nyct/alerts.ts`, unit
  tested). The board shows a strip of lines with problems, a line sheet with the alerts, and station arrivals
  carry a banner for troubled lines serving that station. Served by `/api/line-status`.
- **Railroads with a GTFS-Realtime feed share one builder.** `providers/gtfs/realtime.ts` turns a schedule plus a
  GTFS-RT feed into trips (matching by trip id, or by train number and service date for feeds like Metro-North's whose
  ids are opaque); a railroad supplies a `RealtimeConfig` and its feeds. Metro-North and MBTA Commuter Rail are
  both just that. The MBTA publishes trip updates and vehicle positions as separate feeds for every mode, so its
  provider merges them and keeps commuter rail; its stops are per-track platforms, which the build script
  (`platformStops`) names after the parent station and reads the track from.
- **Boston subway, a second station-first board.** `providers/mbta-subway` is the NYC subway's counterpart with one
  difference that matters: every MBTA train reports a GPS position, so the map shows where trains are, not an
  estimate. Trip updates add each train's next stops and the station arrivals; the schedule is not bundled (only
  stations, lines and track, `realtimeOnly` in the build script). It is its own region (`boston`), since a subway
  board cannot span two cities. Alert-to-line-status logic is shared with the NYC subway (`gtfs/line-status.ts`);
  each operator only says which public line a route rolls up into.
- **Timetable-only rail providers.** Shore Line East and the Hartford Line have no public real-time feed, so
  `providers/gtfs/scheduled.ts` builds their trips from the bundled timetable alone: where each train should be
  now, with delay status "unknown" (nothing is claimed about lateness). They share the schedule decoding and
  position code (`providers/gtfs/`) with Metro-North, and `scripts/build-rail-gtfs.ts` builds each agency's data
  (`calendar.txt` and `calendar_dates.txt` both supported). Shore Line East is one route of Amtrak's GTFS (no
  shapes of its own, so it borrows the Northeast Regional and Acela track); the Hartford Line uses CT DOT's feed.
  Adding real-time later means swapping that provider's `fetchTrips`. These files are not in the weekly refresh
  yet (their download URLs are not confirmed): rerun the `data:*` scripts with fresh zips when timetables change.
- **Amtrak track.** Amtrak's trips come live from Amtraker, which has no geometry, so the track comes from Amtrak's
  GTFS shapes (`npm run data:amtrak`, lines only) and is cut to each region (`clipToRegion`). It lets Penn Station
  and the other Amtrak-only stations sit on a drawn line, and lets reported Amtrak positions snap to the rails.
  Where operators share track, the first registered provider is drawn on top (`server/lines.ts`).
- **Accessibility is gated.** The `lighthouse` CI job (also required by the branch ruleset) audits the board, a
  trip sheet and a station sheet at a perfect accessibility score, on mobile in the light theme and on desktop in the
  dark theme (`lighthouserc*.json`, run locally with `npm run a11y`). It uses demo data and a blank map style so it is
  deterministic. Lighthouse cannot click, so interactive states are reached through deep links.
- **Trains stay on the rails.** Metro-North positions are estimated along schedule track geometry. Schedule shapes
  that are really straight chords are rebuilt from the trip's stations, but each hop between two stations is cut
  from real track wherever a detailed shape covers both (a branch shares its trunk's rails), so only stretches
  with no geometry at all are straight. GPS-reported positions (Amtrak) are snapped onto known track when within
  120 m (`server/snap.ts`). On the map, easing toward corrected data happens *along* the track, never by sliding
  across the landscape; a train drawn nowhere near its new path snaps instead.
- **Map as a transit diagram.** A muted basemap with the network on top: thick colored lines with white
  casings, white station rings, and small train glyphs rotated to the direction of travel. Trains that are
  fine are quiet (white body, line-colored outline); problems are solid status colors with a pulsing glow,
  so trouble stands out. Levels of detail keep it readable: tiny dots zoomed out, glyphs closer, numbers
  closest, and crowds of on-time trains collapse into counted stacks (`stacking.ts`) until you zoom in.
  Schedule shapes that are really chords (a handful of points over tens of km) are detected at build time and
  replaced by the trip's station sequence.
- **Real-time and smooth movement.** The sources set the floor (`/status` shows each feed's own age). On top of
  that, the browser refreshes every 10 s against a 5 s edge cache. Between refreshes the map keeps trains
  moving: each trip carries a `motion` leg (the stretch to the stop it is heading for, following the track, and never
  beyond it, so a train waits at its stop until fresh data confirms it left) and the map moves it by the clock; point-only trips (GPS) glide toward their latest report. When fresh data
  disagrees with where a train is drawn, the difference is blended out over ~0.7 s instead of snapped.
- **Estimated positions.** Where an operator provides no GPS (Metro-North often doesn't), the
  position is interpolated between stations from predicted times and marked `source: "estimated"`.
- **Metro-North trip matching.** The live feed's `trip_id` is opaque and does not match the static
  schedule; the public train number is in the entity id and vehicle label. Trips are therefore matched
  on train number + service date (`data/mnr/services.json` records which dates each service runs),
  with start time and route to disambiguate. `/status` shows how many trips matched which way.
- **Map accuracy.**
  - *Trains:* where an operator gives no GPS, a position is estimated between stations from predicted
    times and then snapped to the track, using the schedule's own geometry (`data/mnr/shapes.json`,
    simplified to ~8 m). On the real Metro-North schedule this moved the average estimate from 527 m
    off the track (up to 5 km) to on it. Estimates are labeled `source: "estimated"`. The same
    geometry is drawn on the map via `/api/lines` (providers opt in with `fetchLines`).
  - *Stations:* provider coordinates are sometimes rough. `data/places/overrides.json` holds
    hand-verified positions (each names its source) that win over a feed, matched by place id or operator
    code. To correct a station, add an entry there; prefer an official source such as an agency's GTFS `stops.txt`.
- **Untrusted upstreams.** Amtraker payloads are parsed per train with zod so one bad record
  doesn't drop the feed; GTFS-RT numeric defaults are checked for presence.
- **Privacy.** No accounts, cookies or server-side user storage. Pins and commutes use `localStorage`; location is read
  by the map in-browser and drawn locally. The one exception is Vercel Web Analytics (`<Analytics />` in
  `app/layout.tsx`): anonymous, cookieless page-view counts. Note that paths such as `/stop/...` and
  `/trip/...` are recorded as page views, so aggregate station popularity is visible, never who looked.

## Extending Hopline

### Add an operator (e.g. NJ Transit, SEPTA)
1. Create `src/providers/<id>/index.ts` exporting a `TransitProvider` (`id`, `name`, `attribution`,
   `mode`, `regionIds`, `fetchTrips`, `fetchPlaces`). `attribution` is required: read the source's terms
   and credit it as asked; the footer renders it automatically. Map raw data to `Trip`; call `finalizeTrip` for derived fields.
2. Register it in `src/providers/registry.ts` and add its display name in `src/domain/operators.ts`.
3. Add fixture-based tests in `tests/`.

### Add a region (a city, a network, or a single airport)
Add a `Region` to `src/domain/region.ts` (bounds, center, zoom, time zone) and list its id in
the `regionIds` of the providers that serve it. The board `/{mode}/{region}`, the chooser entry,
the switcher entry and `/api/trips?mode=&region=` all appear automatically.

### Add a mode (flights, buses, subway, ferry)
1. Add an entry to `MODES` in `src/domain/modes.ts` (slug, nouns, search copy).
2. Write providers with that `mode` that emit `Trip`s. `Trip` is deliberately generic: stops
   (airports, bus stops), position, delay, reason. Map mode-specific fields in the adapter.
3. If the mode needs different presentation (gates, tracks, icons), branch on `trip.mode` in the
   few components that render it; keep the data model unchanged.
