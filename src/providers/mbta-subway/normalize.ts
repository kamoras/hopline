import type { Diagnostics } from "@/domain/trip";
import type { FeedMessage } from "../gtfs/feed";
import { buildSubwayArrivals, buildSubwayTrips } from "../gtfs/subway";
import { MBTA_SUBWAY_ID, type MbtaSubwayStatic } from "./static";

export interface MbtaSubwayInput {
  staticData: MbtaSubwayStatic;
  tripUpdates: FeedMessage;
  vehicles: FeedMessage;
  now: number;
  diag?: Diagnostics;
}

/** The Boston subway's trips: the shared subway builder under the MBTA's operator id. */
export const buildMbtaSubwayTrips = (input: MbtaSubwayInput) => buildSubwayTrips({ operatorId: MBTA_SUBWAY_ID, ...input });

export const buildMbtaSubwayArrivals = buildSubwayArrivals;
