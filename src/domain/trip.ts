/**
 * Provider-agnostic transit model. Every data source is normalized into these
 * types so that the API, UI and map never need to know where data came from.
 * Times are epoch milliseconds (UTC); presentation converts to local time.
 */

import type { MotionLeg } from "@/lib/motion";
import type { Mode } from "./modes";

export type { Mode };

export type TripState =
  | "scheduled" // not yet departed its origin
  | "enroute"
  | "at-station"
  | "completed"
  | "canceled";

/** Coarse, human-meaningful punctuality bucket. */
export type DelayStatus = "on-time" | "minor" | "major" | "canceled" | "unknown";

export type StopState = "departed" | "at" | "upcoming";

export interface StopCall {
  id: string;
  name: string;
  state: StopState;
  /** Timetable times. */
  scheduledArrival?: number;
  scheduledDeparture?: number;
  /** Predicted or actual times (equal to scheduled when on time). */
  arrival?: number;
  departure?: number;
  /** Minutes late at this stop; negative = early. Undefined when unknown. */
  delayMinutes?: number;
  platform?: string;
}

export interface Position {
  lat: number;
  lon: number;
  /** Degrees clockwise from north. */
  heading?: number;
  speedMph?: number;
  /** Feet above sea level (aircraft). */
  altitudeFt?: number;
  /** "reported" comes from the vehicle; "estimated" is interpolated from the schedule. */
  source: "reported" | "estimated";
}

export type DelayReasonKind =
  /** The operator told us why (alert text or cause code). */
  | "operator-reported"
  /** We worked it out from stop times; says where time was lost, not why. */
  | "inferred";

export interface DelayReason {
  kind: DelayReasonKind;
  text: string;
}

export interface Trip {
  /** Globally unique and stable across refreshes: `${operatorId}:${tripKey}`. */
  id: string;
  operatorId: string;
  mode: Mode;
  /** Public trip number, e.g. "2150" or "1302". */
  number: string;
  routeName: string;
  routeColor: string;
  origin: string;
  destination: string;
  state: TripState;
  position?: Position;
  /**
   * Where the train is expected to be over the next minutes, so the map can move it continuously
   * between data refreshes instead of jumping. Absent when the source gives only a point (GPS).
   */
  motion?: MotionLeg[];
  /** Where it is headed when that is off the map (a flight bound for Orlando), so the map can point toward it. */
  destinationAt?: { lat: number; lon: number };
  stops: StopCall[];
  /** Delay at the most recent/next stop, in minutes. */
  delayMinutes?: number;
  delayStatus: DelayStatus;
  delayReason?: DelayReason;
  /** First stop not yet departed. */
  nextStop?: StopCall;
  /** Epoch ms of the provider's last observation of this trip. */
  updatedAt: number;
}

/** Credit a data source asks for, shown wherever its data is shown. */
export interface Attribution {
  /** e.g. "Amtraker". */
  label: string;
  url: string;
  /** Optional legal notice, e.g. a trademark line. */
  notice?: string;
}

/** Counters a provider reports about what it saw and dropped, to make empty boards debuggable. */
export type Diagnostics = Record<string, number | string>;

export interface ProviderStatus {
  id: string;
  name: string;
  attribution: Attribution;
  ok: boolean;
  tripCount: number;
  fetchedAt: number;
  error?: string;
  diagnostics?: Diagnostics;
}

export interface Snapshot {
  mode: Mode;
  regionId: string;
  generatedAt: number;
  trips: Trip[];
  providers: ProviderStatus[];
}
