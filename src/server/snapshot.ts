import type { Board } from "@/domain/board";
import { MODES } from "@/domain/modes";
import { inBBox, type BBox } from "@/lib/bbox";
import type { Diagnostics, ProviderStatus, Snapshot, Trip } from "@/domain/trip";
import { providersFor } from "@/providers/registry";
import { getTrack } from "./lines";
import { snapToTrack } from "./snap";
import type { TransitProvider } from "@/providers/types";

const PROVIDER_TIMEOUT_MS = 8_000;
/** Serve last-known-good data for this long if a provider starts failing. */
const STALE_TOLERANCE_MS = 2 * 60_000;

interface Good {
  trips: Trip[];
  at: number;
}
/** Per-instance cache of public transit data only. Nothing user-specific lives here. */
const lastGood = new Map<string, Good>();

/**
 * What part of a viewport board a request wants: the trips inside a rectangle, or every trip of one route.
 * A big network (buses) never returns everything, so a request with neither gets no trips.
 */
export interface Scope {
  bbox?: BBox;
  route?: string;
}

export function scopeTrips(trips: readonly Trip[], scope: Scope | undefined): Trip[] {
  if (scope?.route) {
    const route = scope.route.toLowerCase();
    return trips.filter((t) => t.number.toLowerCase() === route);
  }
  const box = scope?.bbox;
  return box ? trips.filter((t) => t.position && inBBox(box, t.position.lat, t.position.lon)) : [];
}

/**
 * Many requests for slightly different rectangles arrive together; they share one run of each provider for a
 * few seconds instead of rebuilding every trip per request.
 */
const SHARE_MS = 3_000;
const shared = new Map<string, { at: number; run: Promise<{ status: ProviderStatus; trips: Trip[] }> }>();

async function runProvider(
  provider: TransitProvider,
  { region, mode }: Board,
  now: number,
): Promise<{ status: ProviderStatus; trips: Trip[] }> {
  const key = `${provider.id}:${mode}:${region.id}`;
  const diag: Diagnostics = {};
  try {
    const trips = await provider.fetchTrips({
      region,
      now,
      diag,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    lastGood.set(key, { trips, at: now });
    return { trips, status: { id: provider.id, name: provider.name, attribution: provider.attribution, diagnostics: diag, ok: true, tripCount: trips.length, fetchedAt: now } };
  } catch (err) {
    const cached = lastGood.get(key);
    const usable = cached && now - cached.at <= STALE_TOLERANCE_MS ? cached : undefined;
    return {
      trips: usable?.trips ?? [],
      status: {
        id: provider.id,
        name: provider.name,
        attribution: provider.attribution,
        diagnostics: diag,
        ok: false,
        tripCount: usable?.trips.length ?? 0,
        fetchedAt: usable?.at ?? now,
        error: err instanceof Error ? err.message : "Unknown error",
      },
    };
  }
}

function runShared(provider: TransitProvider, board: Board, now: number) {
  const key = `${provider.id}:${board.mode}:${board.region.id}`;
  const hit = shared.get(key);
  if (hit && now - hit.at < SHARE_MS) return hit.run;
  const run = runProvider(provider, board, now);
  shared.set(key, { at: now, run });
  return run;
}

/** Fan out to every provider for the board; one failing source never blocks the others. */
export async function getSnapshot(board: Board, now = Date.now(), scope?: Scope): Promise<Snapshot> {
  const viewport = MODES[board.mode].viewport;
  const [results, track] = await Promise.all([
    Promise.all(providersFor(board).map((p) => (viewport ? runShared(p, board, now) : runProvider(p, board, now)))),
    getTrack(board).catch(() => undefined), // no track data just means nothing to snap to
  ]);
  return {
    mode: board.mode,
    regionId: board.region.id,
    generatedAt: now,
    trips: (() => {
      const all = results.flatMap((r) => r.trips);
      const wanted = viewport ? scopeTrips(all, scope) : all;
      return track ? snapToTrack(wanted, track) : wanted;
    })(),
    providers: results.map((r) => r.status),
  };
}
