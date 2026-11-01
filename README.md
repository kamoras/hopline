# Hopline

**Where's my train?** A fast, free, open-source single pane of glass for public transit.
Hopline merges live data from multiple operators into one simple view: which trains are
running, who's late, why, and where every train is right now on a map.

**Open the site and you see a live model of transit**: a calm, game-like scale model of everything moving in real time that you can pan and zoom, with a search bar on top so the answer to "where's my train, bus or flight?" is always a tap away.

**Coverage:** Metro-North Railroad, the Long Island Rail Road, MBTA Commuter Rail, SEPTA Regional Rail, MARC, VRE and Amtrak between Boston, New York, Philadelphia, Washington and Norfolk, plus Shore Line East and the Hartford Line (timetable only: no public live feed), the Boston, New York, Philadelphia and Washington buses (every MBTA, MTA, SEPTA and Metrobus bus on a live map when zoomed in, a route followed from a search, next buses at every stop, and the routes with service alerts), ferries (NYC Ferry, NY Waterway and Boston Harbor ferries live on a map with their landings and next boats; the Staten Island Ferry, SeaStreak and the Statue of Liberty ferries by timetable), the Roosevelt Island Tram (timetable), live flights over the New York, Philadelphia and Hartford airports (real aircraft positions on a map, and FAA airport delays and ground stops), the NYC subway (live trains on a map, and next trains at every station by line and direction) the Boston subway ("the T") and the Washington subway (Metrorail), both with real GPS positions, next trains and line status, and Philadelphia's Metro (Market-Frankford, Broad Street and Norristown lines: timetable only, because SEPTA publishes no live positions for them; trains are placed by the schedule, with live service alerts).

- **Answer in one step.** Type a train number (`2150`) or your station (`Stamford`) and see
  the trains due, in arrival order, with live delay.
- **Few clicks for every kind of rider.** Saved commutes ("Stamford to Grand Central") show the next
  departures at the top; station autocomplete, "near me", shareable deep links and a tap-through map
  cover everyone else. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#ways-in-navigation-for-different-people).
- **Delays explained.** Operator-reported causes when the railroad publishes one; otherwise
  we say plainly where time was lost ("Lost 10 min between Stamford and Greenwich") and
  never guess at a cause.
- **Live map.** Every train, color-coded by delay, with smooth movement between updates.
- **Private by design.** No accounts, no cookies, no ad tracking, no database. The only analytics is [Vercel Web Analytics](https://vercel.com/docs/analytics/privacy-policy): anonymous page-view counts, no cookies, no personal data, no cross-site tracking. "My trains"
  and your optional location dot live in your browser only and are never sent anywhere.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional: nothing is required
npm run dev
```

No API keys are needed. To work offline or without upstream feeds, run with synthetic data
that flows through the real normalizers:

```bash
HOPLINE_DEMO=1 npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm run data:mnr` | Regenerate Metro-North schedule data from official GTFS (also `data:mbta-bus`, `data:septa-bus`, `data:wmata-bus`, `data:mta-bus`, `data:mbta-cr`, `data:lirr`, `data:septa-rail`, `data:septa-metro`, `data:nyc-ferry`, `data:nyc-sif`, `data:mbta-ferry`, `data:nywaterway`, `data:seastreak`, `data:statue-ferries`, `data:roosevelt-tram`, `data:mbta-subway`, `data:wmata` (needs `WMATA_API_KEY`, or `-- --zip`), `data:marc`, `data:vre`) |
| `npm run data:shoreline-east -- --zip feed.zip` | Build Shore Line East timetable data from a GTFS zip (also `data:hartford-line`, and `data:amtrak` for Amtrak's track geometry) |
| `npm run a11y` | Accessibility audit (Lighthouse, must score 100); builds in demo mode with a blank map, then audits mobile-light and desktop-dark |

## Deploying on Vercel

Import the repo into Vercel; no configuration is required, except that the Washington subway board needs a free
`WMATA_API_KEY` (set it in the project's environment variables; it is used on the server only). Other optional
environment variables are listed in [`.env.example`](.env.example). `/api/trips` is cached at the edge for 10 s,
so upstream feeds see roughly one request per 10 s regardless of traffic.

## Data sources

| Source | Used for | Notes |
| --- | --- | --- |
| [adsb.lol](https://adsb.lol) (community ADS-B aircraft positions) and the [FAA airport status feed](https://nasstatus.faa.gov) | Live flights, inbound flights per airport, airport delays and ground stops | Keyless. adsb.lol asks for fair use; its data is ODbL. |
| [MTA BusTime](https://bustime.mta.info/wiki/Developers/Index) | Live NYC buses: GPS positions and next buses at every stop | Needs a free key, `MTA_BUSTIME_KEY`, sent as the `key` query parameter from the server only. |
| [SEPTA GTFS-Realtime](https://www.septa.org/developer/) | Live Philadelphia-area buses and trolleys: GPS positions and next buses at every stop | Keyless. |
| [SEPTA GTFS-Realtime](https://www.septa.org/developer/) | Live Regional Rail (a position and delay for each running train), Philadelphia buses, and service alerts for both | Keyless. |
| [MARC GTFS-Realtime](https://www.mta.maryland.gov/schedule-data) and [VRE GTFS-Realtime](https://www.vre.org/about/developers/) | Live Maryland and Virginia commuter rail: delays and GPS positions | Keyless. |
| [MBTA GTFS-Realtime](https://www.mbta.com/developers) (trip updates, vehicle positions, alerts) | Live Boston-area commuter rail, subway and buses: delays, GPS positions, next trains, alert-based reasons and line status | Keyless. `MBTA_API_KEY` is optional and raises the rate limit. |
| [WMATA GTFS-Realtime](https://developer.wmata.com) (Metrorail and Metrobus trip updates, vehicle positions, alerts) | Live Washington metro and buses: GPS positions, next trains and buses, alert-based line status | Requires a free key, `WMATA_API_KEY`, sent as `api_key` from the server only. |
| [MTA GTFS-Realtime](https://www.mta.info/developers) (Metro-North and Long Island Rail Road trip updates, vehicles, alerts) | Live Metro-North and LIRR delays and alert-based reasons | Currently keyless. If MTA requires a key, set `MTA_API_KEY`. |
| [TomTom Traffic Flow tiles](https://developer.tomtom.com) | Optional road congestion overlay | Needs a free developer key, `TOMTOM_API_KEY`, a server secret (tiles are fetched and cached by this site, so the key never reaches the browser and viewers never contact TomTom). Tiles are cached ten minutes and a daily allowance keeps usage inside the free tier. Without it there is no traffic chip. |
| [NYC Ferry GTFS and GTFS-Realtime](https://www.ferry.nyc/developer-tools) | Live NYC Ferry vessel positions, landings and next boats | Keyless. |
| NY Waterway GTFS and GTFS-Realtime; SeaStreak, Statue of Liberty ferries and Roosevelt Island Tram GTFS | Live Hudson River ferries; timetables for the rest | Keyless. |
| [NYC Open Data: Staten Island Ferry GTFS](https://catalog.data.gov/dataset/staten-island-ferry-schedule-general-transit-feed-specification-gtfs) | Staten Island Ferry timetable (no live feed exists) | Converted to JSON at build time. |
| MTA static GTFS | Station names, train numbers, schedules | Converted to JSON at build time, refreshed weekly by a GitHub Action (`npm run data:refresh` rebuilds every bundled schedule). |
| [Amtraker v3](https://amtraker.com) | Live Amtrak positions and delays, stations | Community API, no key. The author asks for credit on the site; Hopline shows it in every board footer. Override the URL with `AMTRAKER_BASE_URL`. |
| [OpenFreeMap](https://openfreemap.org) + MapLibre GL | Base map | Free, keyless. Override with `NEXT_PUBLIC_MAP_STYLE_URL`. |

## API keys

None are required. Amtraker needs no key. MTA's GTFS-Realtime feeds have been served without
one, but if they start returning 401/403, get a key from the [MTA developer
resources](https://www.mta.info/developers) and set `MTA_API_KEY` (it is sent as `x-api-key`).

## Attribution

Each data source credits itself in the footer, as its terms ask: Amtraker for Amtrak data and the MTA
for Metro-North, plus the trademark and non-affiliation notices. This is part of the provider
contract (`TransitProvider.attribution`), so every new source must declare one.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design details and for how to add a new
operator, mode or region. In short: every source is a `TransitProvider` that returns the
common `Train` model; a fault-isolated aggregator merges them; the UI only knows the model.

## License

[AGPL-3.0](LICENSE). Contributions welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
