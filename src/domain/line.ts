/** A drawn route (a rail line's track), for the map. Coordinates are [lon, lat]. */
export interface Line {
  id: string;
  name: string;
  color: string;
  coords: [number, number][];
}
