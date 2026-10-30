import type { Place } from "@/domain/place";
import type { Region } from "@/domain/region";
import type { Mode, Trip } from "@/domain/trip";

export interface FetchContext {
  region: Region;
  signal: AbortSignal;
  /** Injectable clock (epoch ms) so providers are deterministic under test. */
  now: number;
}

/**
 * A transit data source. To add one (another agency, mode, or region):
 *  1. implement this interface in `src/providers/<name>/`,
 *  2. register it in `registry.ts`.
 * Nothing else in the app needs to change.
 */
export interface TransitProvider {
  /** Stable id; also used as the `operatorId` on trips. */
  readonly id: string;
  readonly name: string;
  readonly mode: Mode;
  /** Region ids this provider can serve. */
  readonly regionIds: readonly string[];
  fetchTrips(ctx: FetchContext): Promise<Trip[]>;
  /** Stations/airports in the region, used for search, "near me" and the map. */
  fetchPlaces(ctx: FetchContext): Promise<Omit<Place, "id">[]>;
}
