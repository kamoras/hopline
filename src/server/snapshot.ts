import type { Board } from "@/domain/board";
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

/** Fan out to every provider for the board; one failing source never blocks the others. */
export async function getSnapshot(board: Board, now = Date.now()): Promise<Snapshot> {
  const [results, track] = await Promise.all([
    Promise.all(providersFor(board).map((p) => runProvider(p, board, now))),
    getTrack(board).catch(() => []), // no track data just means nothing to snap to
  ]);
  return {
    mode: board.mode,
    regionId: board.region.id,
    generatedAt: now,
    trips: snapToTrack(results.flatMap((r) => r.trips), track),
    providers: results.map((r) => r.status),
  };
}
