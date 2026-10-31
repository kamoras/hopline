import type { Trip } from "@/domain/trip";
import { buildRealtimeTrips, type RealtimeConfig, type RealtimeInput } from "../gtfs/realtime";

export const MNR_ID = "mnr";
export const MNR_TIMEZONE = "America/New_York";

export const MNR_CONFIG: RealtimeConfig = { id: MNR_ID, name: "Metro-North", routeLabel: (name) => `${name} Line` };

export type MnrInput = Omit<RealtimeInput, "config">;

export function buildMnrTrips(input: MnrInput): Trip[] {
  return buildRealtimeTrips({ config: MNR_CONFIG, ...input });
}
