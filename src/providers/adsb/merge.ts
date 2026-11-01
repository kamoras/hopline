import type { Aircraft } from "./normalize";

/** Aircraft seen by more than one query circle, once each: the sighting with the freshest position wins. */
export function mergeAircraft(lists: readonly (readonly Aircraft[])[]): Aircraft[] {
  const byHex = new Map<string, Aircraft>();
  for (const list of lists) {
    for (const ac of list) {
      const seen = byHex.get(ac.hex);
      if (!seen || (ac.seen_pos ?? Infinity) < (seen.seen_pos ?? Infinity)) byHex.set(ac.hex, ac);
    }
  }
  return [...byHex.values()];
}
