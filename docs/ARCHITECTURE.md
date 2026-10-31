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
  `/rail/northeast`.
- **Naming.** Rapid transit is a mode called **Metro** (`MODES.subway`, slug `metro`, board `/metro/nyc`), because
  cities do not agree on "subway"; the operator keeps the local name (NYC Subway, The T, Washington Metro). The
  mode's internal id stays `subway`, which `getMode` still accepts, so the API and old `/subway/...` links keep
  working (the board page redirects them to the canonical `/metro/...`).
- **Moving between modes** needs no menu. Tabs for every mode available sit in the header (`ModeTabs`); the
  area carries over: a tab opens the board of that mode for wherever the map is looking
  (`nearestBoard` in `domain/board.ts`: the board whose area contains the point, else the closest), so Trains
  at New York then Subway is the New York subway, not Boston's. They are real links (open in a new tab, work
  without JavaScript). The title menu only chooses another *area* of the same mode.
- **Interchanges.** A station sheet lists the other modes' stations beside it ("Also here: Subway Grand
  Central-42 St"), each opening that station on its board. `server/connections.ts` finds them by distance
  (about a three-minute walk) and only consults boards whose area contains the station, so it never loads a
  faraway board's data; `/api/connections` is cached for an hour. A new mode gets its tab and its interchanges
  for free once it has a board and places.
- **Isolation:** the API, aggregation and cache are all keyed by (mode, region), so an Atlanta
  flight board never loads, or even fetches, New York train data.

## Ways in (navigation for different people)

Different riders want different shortcuts, so each has a path with as few taps as possible.
All state below lives in the URL or in the browser; none of it reaches a server.

| Person | Fastest path |
| --- | --- |
| Daily commuter | **My commutes** (saved "A to B") sit at the top of the board with the next departures; **My trains** pin by number and survive across days. `/` offers "Continue" to the last board. |
| Just looking, or in a hurry | The home page is a live model of everything moving: pan and zoom to browse, or search at the top; tap a vehicle or station for its answer card. |
| Knows their train | Type the number. Or open the shareable deep link `/{mode}/{region}/trip/{operator}-{number}`. |
| Thinks in sentences | Natural language works: `new haven to new york round trip`, `trains leaving stamford to grand central right now`, `nyc`. `src/lib/query.ts` turns text into an intent (legs, round trip, time window) and region `aliases` map city names to station names; anything unrecognized falls back to number/station search. |
| Knows their station | Type it: autocomplete opens its departures (`/{mode}/{region}/stop/{place}`). Type `A to B` for trains that call at both, then save it as a commute. |
| Just arrived / unsure | **Near me** (on-device location) suggests the nearest stations; no typing. |
| Changing from train to subway (or flights, later) | Tap the mode tab in the header; it opens the same area. Or tap "Also here" in a station sheet to jump to that interchange's other board. |
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
  both just that. Railroads that publish trip updates and vehicle positions as separate feeds (MBTA Commuter Rail,
  MARC, VRE) are a config for `createRealtimeRailProvider`, which merges them and keeps only the schedule's routes;
  the MBTA's feeds also carry its buses, subway and ferries; its stops are per-track platforms, which the build script
  (`platformStops`) names after the parent station and reads the track from. SEPTA Regional Rail is the same config
  over SEPTA's separate rail feeds (the rail schedule is `google_rail.zip` inside SEPTA's zip, and the build gives
  its thirteen identically colored lines distinct colors, `routeColors`). Its trip updates give a delay by stop
  sequence only, so the builder reads that delay at the stop the vehicle reports.
- **Boston subway, a second station-first board.** `providers/mbta-subway` is the NYC subway's counterpart with one
  difference that matters: every MBTA train reports a GPS position, so the map shows where trains are, not an
  estimate. Trip updates add each train's next stops and the station arrivals; the schedule is not bundled (only
  stations, lines and track, `realtimeOnly` in the build script). It is its own region (`boston`), since a subway
  board cannot span two cities. Alert-to-line-status logic is shared with the NYC subway (`gtfs/line-status.ts`);
  each operator only says which public line a route rolls up into.
- **Washington subway, the same board on a keyed feed.** `providers/wmata` reuses the Boston subway's machinery, now
  shared as `providers/gtfs/subway.ts` (station grouping by name, trips from vehicle positions plus trip updates,
  station arrivals): an operator supplies its bundled stations and lines, its feed URLs and its line badges. Metrorail
  differs in three ways. The feeds (`api.wmata.com/gtfs/rail-gtfsrt-{tripupdates,vehiclepositions,alerts}.pb`) need a
  key, sent as the `api_key` header from `WMATA_API_KEY` on the server only (never logged, never sent to the browser;
  the static build reads it too, or takes `--zip`). Some vehicles report a position but no trip and are skipped. And
  Yellow, Orange and Silver badges use dark text, so the build keeps each route's text color (`routeTextColor`) and
  arrivals carry it. Region `washington` covers DC and its Maryland and Virginia suburbs out to Ashburn.
- **Flights (a station-first mode with real positions).** `mode: "flights"` is `browse: "stations"`: the board lists
  airports, with live aircraft on the map. `providers/adsb` reads adsb.lol's ADS-B feed (one query around the
  airports, shared by trips and arrivals for a few seconds) and the FAA's airport status. ADS-B carries no route or
  schedule, so no lateness is claimed (delay status is "unknown", `reportsDelay: false`) and a flight's destination
  is only known when it is descending into a covered airport; `classify` infers arriving, departing or
  overflying from altitude, climb rate and heading, and refuses an airport the plane is too high to land at
  (about 350 ft per nautical mile). Each plane gets a short motion leg along its heading, from when the aircraft
  actually reported, so it glides between the ten-second refreshes like a train. FAA delays, ground stops and
  closures reuse the line-status strip and sheet, with airports as the "lines" (`lineNoun`). Real departures and
  arrivals boards (scheduled times, gates) need a keyed schedule API and are not included.
- **Buses (a viewport-scoped, stop-first mode).** `mode: "bus"` is `browse: "stations"` and `viewport: true`.
  `providers/mbta-bus` reuses the metro machinery in `providers/gtfs/subway.ts` (vehicle positions plus trip
  updates; arrivals per stop) with every stop its own place (`placeIds: "stop"`, since stops share names), and only
  bundles stops, routes and track (`data:mbta-bus`, `realtimeOnly` and `scanStops` in the build script: the schedule
  has millions of stop times that are never needed). The board is stop-first plus route search: find a stop (by
  name, near you, or on the map once zoomed in) for the next buses by route, or search a route number to follow it
  (its track and every bus on it, at any zoom). Zoomed out, the map shows a prompt instead of buses; buses appear
  from zoom 12 and stops from zoom 14. Boston buses share the `boston` region with the T. `providers/septa-bus`
  (region `philadelphia`) is the same provider with another feed: SEPTA's vehicles often report a position but no
  trip, so the shared builder joins them to the trip update that names the same vehicle id. Its static feed is a zip of
  zips, so the build script reads `google_bus.zip` inside it (`innerZip`). Route badges choose black or white text by
  contrast (`readableTextColor`), since the colors differ by operator. `providers/wmata-bus` (Metrobus, region
  `washington`) is the third: the same provider again, using Metrorail's key and feed helpers
  (`providers/wmata/feeds.ts`); the key is read on the server only and the build script's `--zip` path takes the
  downloaded static feed. `providers/mta-bus` (NYC, region `nyc`, sharing it with the metro) is the fourth. Its live
  feed needs a BusTime key, sent as a `key` query parameter and read from `MTA_BUSTIME_KEY` on the server only (the
  feed fetcher names only the host in an error, so a failing request cannot leak it, and a missing key says so on
  the status page instead of failing silently). Its static data comes as one feed per borough plus the MTA Bus
  Company's, each listing every NYCT route but only its own trips, so `scripts/build-mta-bus.ts` builds each with the
  shared build script (`--out`) and merges them by stop, route and shape. A full NYC snapshot is about 2,200 buses
  (2 MB), which is exactly what viewport scoping keeps off the wire.
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
- **Crowded maps thin out by priority.** Stations are not all drawn at every zoom. `assignDetailZoom`
  (`lib/declutter.ts`) gives each one the zoom it first appears at: most important first (`placeImportance`: the number
  of different lines through it, a bonus for termini, a little for shared platforms), each appears when no more
  important station on screen is within 20 px, and only if it also stays clear at every deeper zoom, so zoomed out a
  metro shows its interchanges and termini and zooming in fills in the rest, and a station never vanishes as you
  zoom in. One layer per zoom with a plain filter keeps hidden stations from taking up label room, labels are placed
  in importance order, and the chosen station always shows. Train stacks use a radius wider than their badge so two
  badges never overlap. A randomized test checks the 20 px rule against an independent projection.
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

## The model: Hopline's home page

Hopline opens on a live scale model of transit, not a list: everything that is moving, drawn as a calm diagram
you can pan and zoom, so people can drop in just to look, or get an answer fast. The answer to "where's my train,
bus or flight" is always one step away: a search bar floats on top of the map, and tapping any vehicle or station
opens an answer card (next stop and time, status, the next arrivals at a station) with one button for the full
board. The boards are still listed below the map, so nothing depends on the canvas.

- **One map, every board.** `useWorld` (`hooks/use-world.ts`) merges the boards in view into one set of trips, track
  and stations. `lib/world.ts` decides which boards those are: in view, switched on, and past their mode's zoom
  (`MODE_MIN_ZOOM`: trains 5, flights 6, metro 8, buses 12), so a board nobody can read is never fetched. Small
  boards load whole once; a big network (buses) is asked for the visible area, rounded outward. A station's id on
  the combined map carries its board (`worldPlaceId`) so equal ids on different boards stay apart.
- **The same drawing as a board.** The map is the board map (`TripMap`): schematic lines, stations thinned by
  importance as you zoom, vehicles gliding between refreshes, delays that pop, stacks for crowds. Mode switches (Trains,
  Metro, Flights, Buses) turn layers on and off and show how many vehicles each has moving right now.
- **Living, not scored.** The aim is a model that is pleasant to watch because it is real; there are no points or
  levels. Anything the page remembers (the last board) stays on the person's device.
- **Living touches** (`living` on `TripMap`, used by the home page only). The basemap is calmer so the network is
  what you see. The basemap dims to a navy tint at night by the real sun at the center of the map (`lib/sun.ts`,
  NOAA equations, no network, no stored location; skipped when the device is already in a dark theme). When a vehicle
  newly pulls into a station a ring ripples out and fades (`lib/ripples.ts`; the first data after load makes none, and
  reduced-motion turns them off).
- **Aircraft.** Planes have no track, so each one shows where it has been, a fading trail kept in memory only
  (`lib/trail.ts`, about two minutes, never sent anywhere), and where it is headed, a dashed line to its airport
  when known. The chosen plane's lines are brighter. Planes are drawn 1.5x larger with a soft halo so they stay
  findable on any basemap.
- **Dark mode is a real dark basemap** (OpenFreeMap `dark`), not an inverted light one, so our own colors (white
  plane bodies, station rings, trails) keep their meaning. `BaseMap` picks the style from the device's appearance;
  `NEXT_PUBLIC_MAP_STYLE_URL` overrides both. Map labels switch to light text with a dark halo.

## Brand and design system

Calm and trustworthy: cool neutral surfaces, ink text, a navy brand and one blue accent for interaction. Status
colors (green, amber, red) mean service status and are never reused for decoration.

- **One source of truth.** `src/brand.ts` holds the name, tagline ("Know before you go."; two alternatives are
  noted beside it), description and brand colors used in JavaScript. Change them there: the page metadata, social
  card, web manifest and home page all read it. CSS tokens live in `src/app/globals.css` (surfaces, text, accent,
  status colors, shadows), each with a dark-theme value; `tests/contrast.test.ts` fails the build if any
  text/background pair drops below WCAG AA in either theme.
- **The mark** is a hop between two stops on a line (`components/brand/mark.tsx`, plain SVG so it also draws the
  favicon, the iOS home-screen icon, the PWA icons and the share card: `app/icon.tsx`, `apple-icon.tsx`,
  `opengraph-image.tsx`, `manifest.ts`). `Logo` is the mark plus a live-text wordmark.
- **Type** is Inter (variable, self-hosted via `@fontsource-variable/inter`, so there are no font requests to a third
  party) with tabular figures for times.
- **Empty states** share one component (`components/empty-state.tsx`: calm line art for quiet, search, offline and
  lost) so "nothing here" always says why and what to do next.
- **Motion** is short and purposeful (sheets, new cards, a tap), and all of it stops under reduced motion.

## Scaling

Hopline is built so that adding places adds cost only where people are looking. The rules, and what
enforces them:

- **Nothing scans the whole network per request.** Snapping GPS fixes to track uses `TrackIndex`
  (`lib/track-index.ts`): a grid over every track segment, built once per board, so a lookup reads the
  few segments in its cell. It replaced a loop over every point of every line (324 ms for 150 trains
  became 2 ms; 1,500 trains went from 3.4 s to 17 ms). `pointAlong` is a binary search, and marker
  stacking buckets markers into a grid (20,000 markers: 1 s to 46 ms).
- **Fast versions must match the simple ones.** Each of those has a randomized test against the
  straightforward brute-force version it replaced (`tests/track-index.test.ts`, `tests/stacking.test.ts`,
  `tests/polyline.test.ts`) plus a generous time budget, so a regression to quadratic fails CI.
- **Data loads when its board is used.** An agency's bundled schedule and track are separate lazy chunks
  (`providers/gtfs/dataset.ts`: `lazyStaticData`, `loadDataFile`; each provider supplies its own literal
  `import(`../../../data/<id>/${name}.json`)` so one agency's files can never change what another resolves), so a server instance only reads and keeps
  the agencies whose boards are requested (Boston's subway alone: +10 MB; the Northeast rail data: +60 MB).
  Never import `data/**/*.json` at module level in a provider.
- **The schedule is scanned once per date**, and schedule-only providers decide from a trip's first and
  last times before building its stops, so only trips near "now" are built out.
- **The map only moves what is on screen.** Each frame moves and draws trains inside the viewport plus a
  margin (and the selected train); panning or zooming re-evaluates. The cost follows the screen, not the
  size of the network.
- **Static data is cached long, live data briefly**: lines for a day at the CDN, places for an hour, trips
  for 5 s, so traffic costs a handful of upstream fetches however many people look.

- **Big networks load by viewport.** A mode with `viewport: true` (buses) never sends its network whole: the page
  ships no stops and no vehicles; `/api/trips` takes `bbox` (what is on screen) or `route`, `/api/places` takes
  `bbox`, `near`, `q` or `id`, `/api/lines` takes `route`, and `/api/routes` searches routes by number or name.
  Server-side, `PlaceIndex` (a grid plus a normalized-name list) answers those without scanning, providers' runs
  are shared for a few seconds across the many slightly different rectangles, and the client rounds rectangles
  outward to a grid (`snapBbox`) so panning reuses cacheable requests. Each has a randomized test against the
  obvious version and a time budget on a 200,000-place list (`tests/viewport.test.ts`).

Known limits on the way to a national network, in the order they will bite:
1. A small mode's board is `mode + region` and returns every trip in the region. Keep regions city- or
   corridor-sized (the Northeast rail board, Boston to Norfolk, is about as large as is comfortable); a mode
   that outgrows that sets `viewport: true`.
2. `/api/lines` ships every line of a board as JSON (about 1 MB for the Northeast). Fine behind a day-long
   CDN cache; compress (encoded polylines) or simplify by zoom before adding much more track.
3. Schedule-only providers still decode every trip active on a date once; a per-date index by start and end
   time would avoid that for very large agencies.

## Extending Hopline

### Add an operator (e.g. NJ Transit, SEPTA)
1. Create `src/providers/<id>/index.ts` exporting a `TransitProvider` (`id`, `name`, `attribution`,
   `mode`, `regionIds`, `fetchTrips`, `fetchPlaces`). `attribution` is required: read the source's terms
   and credit it as asked; the footer renders it automatically. Map raw data to `Trip`; call `finalizeTrip` for derived fields.
2. Register it in `src/providers/registry.ts` and add its display name in `src/domain/operators.ts`.
3. Load bundled data lazily: build it with `scripts/build-rail-gtfs.ts` and use `lazyStaticData(files, brand)`
   with `const files: DataFiles = (name) => import(`../../../data/<id>/${name}.json`)` (or `loadDataFile` for custom data) instead of importing the JSON. See "Scaling".
4. Add fixture-based tests in `tests/`.

### Add a region (a city, a network, or a single airport)
Add a `Region` to `src/domain/region.ts` (bounds, center, zoom, time zone) and list its id in
the `regionIds` of the providers that serve it. The board `/{mode}/{region}`, the chooser entry,
the switcher entry and `/api/trips?mode=&region=` all appear automatically.

### Add a mode (flights, buses, subway, ferry)
1. Add an entry to `MODES` in `src/domain/modes.ts` (slug, nouns, search copy). Set `viewport: true` if the network is
   too big to send whole (see "Scaling").
2. Write providers with that `mode` that emit `Trip`s. `Trip` is deliberately generic: stops
   (airports, bus stops), position, delay, reason. Map mode-specific fields in the adapter.
3. If the mode needs different presentation (gates, tracks, icons), branch on `trip.mode` in the
   few components that render it; keep the data model unchanged.
