import { REGIONS } from "@/domain/region";

/**
 * Road congestion: an optional overlay of TomTom's Traffic Flow tiles (free developer tier). The key is a secret read on
 * the server only (`TOMTOM_API_KEY`); the browser never sees it and never talks to TomTom. It asks Hopline's own
 * `/api/traffic/{z}/{x}/{y}` route, which fetches the tile and caches it for a minute at the edge, so TomTom does not learn
 * who is looking and many viewers share one request. Without a key the overlay does not exist.
 */

/** City scale and closer: the overlay is an overview of conditions (no ETAs, no directions), so it needs no fine detail. */
export const TRAFFIC_MIN_ZOOM = 9;
/** Closer than this the map stretches the zoom-12 tile (about 10 km across): fewer distinct tiles are ever requested. */
export const TRAFFIC_MAX_ZOOM = 12;
/** How long a tile is shared by everyone at the edge. Longer means fewer TomTom requests, shorter means fresher roads. */
export const TRAFFIC_CACHE_S = 600;

/** Whether traffic is configured on this server (read on the server; the page tells the browser only yes or no). */
export const trafficAvailable = () => !!process.env.TOMTOM_API_KEY;

/** The tile template the map loads, from this site. */
export const trafficTilePath = (origin: string) => `${origin}/api/traffic/{z}/{x}/{y}`;

const tileX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/**
 * Is this a tile the overlay could ask for? Only zooms it uses, and only tiles that touch an area Hopline covers, so the
 * route cannot be used to spend the free quota on anything else.
 */
export function validTile(z: number, x: number, y: number, areas: readonly (readonly [number, number, number, number])[] = REGIONS.map((r) => r.bounds)): boolean {
  if (!(Number.isInteger(z) && Number.isInteger(x) && Number.isInteger(y) && z >= TRAFFIC_MIN_ZOOM && z <= TRAFFIC_MAX_ZOOM && x >= 0 && y >= 0 && x < 2 ** z && y < 2 ** z)) return false;
  return areas.some(([w, s, e, n]) => x >= tileX(w, z) && x <= tileX(e, z) && y >= tileY(n, z) && y <= tileY(s, z));
}

/**
 * A daily allowance of upstream requests, so a busy day (or an attack) stops at a number we chose instead of running past
 * the free tier. It counts per server instance and resets each UTC day; the edge cache in front of it does most of the work.
 */
export function createBudget(limit: number, now: () => number = Date.now) {
  let day = -1;
  let used = 0;
  return {
    take(): boolean {
      const today = Math.floor(now() / 86_400_000);
      if (today !== day) [day, used] = [today, 0];
      if (used >= limit) return false;
      used++;
      return true;
    },
  };
}

/** TomTom's own address for a tile, with the key (server only). */
export const upstreamTileUrl = (key: string, z: number, x: number, y: number) =>
  `https://api.tomtom.com/traffic/map/4/tile/flow/relative/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}&tileSize=256`;
