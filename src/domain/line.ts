/** A drawn route (a rail line's track), for the map. Coordinates are [lon, lat]. */
export interface Line {
  id: string;
  name: string;
  color: string;
  /** The public route it belongs to ("1", "SL1"): lets a big network show one route's track on request. */
  route?: string;
  coords: [number, number][];
}
