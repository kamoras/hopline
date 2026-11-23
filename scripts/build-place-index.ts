/**
 * Writes places.json: every station of every whole-area board (trains, metro, ferries, flights), so search finds a station
 * without the server opening each agency's schedule.
 *
 *   npm run data:places                       # into dist-data/places.json
 *
 * Run after `npm run data:publish`, with HOPLINE_DATA_URL=file://$PWD/dist-data and HOPLINE_STATES=all so the generated
 * agencies are read from that folder. Buses are left out: thousands of stops called "Main St" are not what search is for
 * (a bus board is searched by route).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MODES } from "../src/domain/modes";
import { listBoards } from "../src/providers/registry";
import { getPlaces } from "../src/server/places";
import type { IndexedPlace, PlaceSearchIndex } from "../src/server/search-index";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", process.argv[2] ?? "dist-data", "places.json");
const places: IndexedPlace[] = [];
let boards = 0;
for (const board of listBoards()) {
  if (MODES[board.mode].viewport) continue;
  const list = await getPlaces(board).catch(() => []);
  if (!list.length) console.warn(`No stations for ${board.mode}/${board.region.id}`);
  boards++;
  for (const p of list) places.push([board.mode, board.region.id, p.id, p.name, Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5]);
}
const index: PlaceSearchIndex = { generatedAt: new Date().toISOString(), places };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(index));
console.log(`Indexed ${places.length} stations on ${boards} boards into ${out}`);
