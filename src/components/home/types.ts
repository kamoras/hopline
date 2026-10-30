import type { Mode } from "@/domain/modes";

/** A board placed on the home map. */
export interface RegionPin {
  mode: Mode;
  name: string;
  href: string;
  lat: number;
  lon: number;
}
