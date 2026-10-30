# Hopline

**Where's my train?** A fast, free, open-source single pane of glass for public transit.
Hopline merges live data from multiple operators into one simple view: which trains are
running, who's late, why, and where every train is right now on a map.

**Coverage:** Metro-North Railroad and Amtrak between New York, Connecticut and Philadelphia, plus Shore Line East and the Hartford Line (timetable only until their schedule data is added, see below), and the NYC subway (live trains on a map, and next trains at every station by line and direction).

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
| `npm run data:mnr` | Regenerate Metro-North schedule data from official GTFS |
| `npm run data:shoreline-east -- --zip feed.zip` | Build Shore Line East timetable data from a GTFS zip (same for `data:hartford-line`) |

## Deploying on Vercel

Import the repo into Vercel; no configuration is required. Optional environment variables
are listed in [`.env.example`](.env.example). `/api/trips` is cached at the edge for 10 s,
so upstream feeds see roughly one request per 10 s regardless of traffic.

## Data sources

| Source | Used for | Notes |
| --- | --- | --- |
| [MTA GTFS-Realtime](https://www.mta.info/developers) (Metro-North trip updates, vehicles, alerts) | Live Metro-North delays and alert-based reasons | Currently keyless. If MTA requires a key, set `MTA_API_KEY`. |
| MTA static GTFS | Station names, train numbers, schedules | Converted to JSON at build time, refreshed weekly by a GitHub Action. |
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
