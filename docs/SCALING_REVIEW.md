# Scaling review: what breaks first, with numbers

Hopline now covers the Northeast (about 20 boards, 60 agencies' worth of feeds). This is a measured look at what would
break first if it grew toward a whole continent, what was fixed, and what to do next. Numbers are from a production build
(`next start`) against real feeds on a small cloud sandbox with no GPU, so treat absolute times as rough and ratios as
reliable. Date measured: 2 November 2026.

## Summary

| # | Problem | Evidence | Status |
| --- | --- | --- | --- |
| 1 | **Download size per viewer** is the cost that scales worst | ~400 KB gzipped every 10 s for a New York view with every mode on (about 2.4 MB a minute); free hosting bandwidth runs out at tens of thousands of viewer-minutes a month | **Recommendation 1** (not built) |
| 2 | **Server memory** per instance grows with every agency touched | RSS 120 MB at start, 295 MB after the rail, metro, ferry and flights boards, **594 MB** after every bus board (a 1 GB function limit is not far) | **Reduced to 473 MB** (this PR) |
| 3 | **The flights board could fail whole** | 250 route lookups were fired at once; under load the board hit its 8 s provider timeout and showed no aircraft | **Fixed** (this PR) |
| 4 | Cold start of the rail board | 3.2 s for the first request (loads Metro-North, LIRR, MBTA, SEPTA, Amtrak schedules), 0.2 s after | Known; Recommendation 3 |
| 5 | Upstream load on free community services | adsb.lol: two ~400 KB requests per 8 s per server instance | Within fair use; watch with more instances |
| 6 | **Client drawing cost** | 0.2 to 0.7 ms of JavaScript per frame with 640 to 1,300 vehicles on screen (viewport culling works) | **No problem** |

## 1. Download size: the real scaling limit

Per refresh (every 10 s), raw JSON and gzipped (what a CDN sends):

| Board | Vehicles | Raw | Gzip |
| --- | --- | --- | --- |
| Trains, Northeast | 265 | 944 KB | 106 KB |
| Metro, New York | 342 | 329 KB | 34 KB |
| Flights, Northeast | 580 | 318 KB | 59 KB |
| Buses, New York (whole city) | 1,585 | 1,451 KB | 204 KB |
| Ferries, New York | 31 | 26 KB | 4 KB |

A viewer zoomed on New York with trains, metro, flights, ferries and buses on pulls about **400 KB gzipped every 10 s**, so
about 2.4 MB a minute. At the free-tier bandwidth of a typical host (100 GB a month) that is about 40,000 viewer-minutes
(about 700 hours) a month. Origin load is not the problem (responses are shared at the edge for 5 s); egress is. It grows
linearly with viewers and with every region added, because every active board is polled in full.

Why it is large: each trip carries its full list of stops (3.5 KB per train), and the map only needs a position, a
heading, a color and a status for 95% of the vehicles it draws.

**Recommendation 1 (biggest win): a positions-only feed for the map, and trip detail on demand.** The map polls a compact
feed (id, position, heading, color, status, number: about 60 bytes a vehicle, so about 80 KB raw and about 25 KB gzipped
for the 1,300-vehicle New York view above, 16 times smaller) and opens `/api/trip?id=` for a vehicle's stops only when its
drawer opens (refreshing while it is open). Search by station, "A to B" and saved commutes need stops, so they move to a
server-side search endpoint (`/api/search/trips`) that answers from the same cached snapshot. This is a contained change
(the drawers and search already receive trips through one hook, `useWorld`) but it touches search, so it is worth its own
PR with its own tests.

Smaller levers, in order of payoff: drop `nextStop` from the wire (it duplicates `stops[0]`, about 8%); send each
operator's name and color once per response rather than per trip; poll slower for a board nobody is looking at (a tab in
the background already pauses); and raise the edge cache from 5 s to 10 s for boards whose vehicles move slowly (ferries,
Staten Island, long-distance trains).

## 2. Server memory

Resident memory of one server instance (everything one process holds once the boards have been asked for):

| After | Before this PR | After this PR |
| --- | --- | --- |
| Start | 120 MB | 120 MB |
| Rail, metro, ferry and flights boards | 295 MB | 275 MB |
| Every bus board (11 of them) | **594 MB** | **473 MB** |

Where it goes (heap, after garbage collection): Metro-North's schedule is 69 MB for 3.5 MB of JSON, the LIRR 18, MBTA
commuter rail 14, SEPTA rail 11; Amtrak's track 38 MB (70,000 points as objects); a bus system 30 to 60 MB each, of which
about half was geometry kept only to snap buses to their routes and to list route names.

Fixed here:
- A big network (buses) is no longer snapped to its routes on the server (GPS is good enough at that scale), so no spatial
  index is built for it.
- Route search lists routes from the schedule's route table (`fetchRoutes`, no geometry), and `/api/lines?route=` builds
  only the requested route's track (`lines(onlyRoute)`), instead of every route of the network.
- The Amtrak build drops track outside the Northeast (`clipTo`).
- Flight route lookups run through 16 workers, not 250 at once.

Recommendation 2: **evict the least recently used agency data** once a limit is passed (the loaders are already lazy and
memoized, so an eviction policy is a small change), and consider storing trips as typed arrays (Metro-North's 69 MB is
mostly string and array overhead for data that never changes). Neither is needed until instances are memory-limited, which
at 473 MB they are not yet on a 1 GB function.

## 3. Cold start and per-request cost

| Board | Trips | First request | Repeat |
| --- | --- | --- | --- |
| Trains, Northeast | 265 | 3,212 ms | 198 ms |
| Metro, New York | 342 | 604 ms | 385 ms |
| Metro, Washington | 73 | 622 ms | 162 ms |
| Buses, New York | 1,585 | 1,273 ms | 727 ms |
| Buses, Washington | 626 | 1,136 ms | 205 ms |
| Buses, Connecticut | 112 | 1,770 ms | 480 ms |
| Ferries, New York | 31 | 777 ms | 371 ms |

The first request after a cold start pays for loading and indexing that board's schedules; a repeat is dominated by
fetching and decoding the live feeds (200 to 700 ms). Both are comfortably inside the 8 s provider timeout, and shared
runs (3 s) mean concurrent viewers do not multiply upstream fetches. Recommendation 3: warm the rail board's data at
deploy time (a scheduled request) so no viewer pays the 3 s, and keep each API route's bundle small (data is lazy per
agency already).

## 4. Flights board failure (fixed)

With 250 flight-route lookups launched at once, a slow moment turned into the 8 s provider timeout and an empty board. Now
at most 16 lookups run at once, a refresh waits at most 1.5 s for them (the rest finish for the next one), and the
result is cached for six hours, so a refresh normally takes 1.5 to 2.5 s.

## 5. Upstream fair use

Every feed is fetched at most once per 3 to 8 s per server instance however many people watch (shared runs, TTL caches).
That is polite for a handful of instances. adsb.lol (a free community service) is the one to watch: two circles of about
400 KB each every 8 s per instance. If Hopline ever runs many instances, put the aircraft fetch behind one shared cache
(or ask adsb.lol for a feeder-level feed) instead of letting each instance ask.

## 6. Client

With the map at New York, 877 vehicles drawn: **0.7 ms average (5 ms worst) of JavaScript per frame** for building and
sending the vehicle layers; 1,314 vehicles: 0.5 ms. The map only moves vehicles on or near the screen (25% margin), so cost
follows what is visible, not what is loaded. The remaining cost is rendering, which belongs to the GPU. (The sandbox has no
GPU and drew 3 to 6 frames a second, so frame rate was not measured; JavaScript cost was.) Nothing to fix here; the
polling payload above is what to reduce.

## What a whole-continent Hopline would need

1. The positions-only feed (recommendation 1), so the cost per viewer stops growing with the number of vehicles.
2. Per-region boards are already independent (an Atlanta viewer never loads New York data); keep it that way and add
   regions rather than enlarging them.
3. Static schedule data off the function bundle: at 25 MB today it is fine, but hundreds of agencies belong in object
   storage or a small database, loaded on first use and evicted (recommendation 2).
4. A vector-tile or per-tile API for stations and routes when a view spans hundreds of thousands of stops.
