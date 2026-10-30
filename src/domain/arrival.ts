/** One train due at a station: the unit of a station-first board. */
export interface Arrival {
  tripId: string;
  /** Public line name, e.g. "A", "7". */
  route: string;
  color: string;
  textColor: string;
  /** Where the train is going, e.g. "Inwood-207 St". */
  headsign: string;
  /** Epoch ms. */
  at: number;
  /** The platform stop id it uses, e.g. "127N". */
  platform: string;
}
