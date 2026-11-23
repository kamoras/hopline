import { boardHref, placeHref } from "@/domain/board";
import { MODES, type Mode } from "@/domain/modes";
import { normalizeName } from "@/domain/place";
import { listBoards } from "@/providers/registry";
import { getPlaces } from "./places";
import { loadSearchIndex, searchIndex } from "./search-index";

export interface CatalogHit {
  kind: "board" | "place";
  label: string;
  detail: string;
  href: string;
  /** For a place: where it is and which board it is on, so the app can fly there and open it. */
  place?: { id: string; mode: Mode; regionId: string; lat: number; lon: number };
}

const LIMIT = 8;

/**
 * Universal search over everything Hopline knows how to show: boards (a mode in
 * a region) and places (stations, airports). Server-side so the catalog can grow
 * to thousands of entries without shipping it to every visitor.
 */
export async function searchCatalog(query: string): Promise<CatalogHit[]> {
  const q = normalizeName(query);
  if (!q) return [];
  const hits: (CatalogHit & { rank: number })[] = [];
  const boards = listBoards();
  // With the published index, stations are found without opening any agency's data; without one (development, or a host
  // that has none yet) every board's places are walked, as before.
  const index = await loadSearchIndex();
  const shown = new Map(boards.map((b) => [`${b.mode}/${b.region.id}`, b]));

  for (const board of boards) {
    const href = boardHref(board.mode, board.region.id);
    const detail = `${MODES[board.mode].label} · ${board.region.name}`;
    if (normalizeName(detail).includes(q)) hits.push({ kind: "board", label: detail, detail: "Board", href, rank: 1 });
    if (index || MODES[board.mode].viewport) continue; // thousands of stops named "Main St" are not universal-search material
    for (const place of await getPlaces(board)) {
      const name = normalizeName(place.name);
      if (name.includes(q)) {
        hits.push({ kind: "place", label: place.name, detail, href: placeHref(href, place.id), place: { id: place.id, mode: board.mode, regionId: board.region.id, lat: place.lat, lon: place.lon }, rank: name.startsWith(q) ? 0 : 2 });
      }
    }
  }
  if (index) {
    for (const { place: [mode, regionId, id, name, lat, lon], rank } of searchIndex(index.places, query, new Set(shown.keys()))) {
      const board = shown.get(`${mode}/${regionId}`)!;
      hits.push({ kind: "place", label: name, detail: `${MODES[mode].label} · ${board.region.name}`, href: placeHref(boardHref(mode, regionId), id), place: { id, mode, regionId, lat, lon }, rank });
    }
  }
  return hits
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
    .slice(0, LIMIT)
    .map(({ kind, label, detail, href, place }) => ({ kind, label, detail, href, place }));
}
