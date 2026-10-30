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
- **Privacy.** No cookies, analytics or user storage. Pins use `localStorage`; location is read
  by the map in-browser and drawn locally.

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
