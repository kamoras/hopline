import { boardHref, placeHref } from "@/domain/board";
import { MODES } from "@/domain/modes";
import { normalizeName } from "@/domain/place";
import { listBoards } from "@/providers/registry";
import { getPlaces } from "./places";

export interface CatalogHit {
  kind: "board" | "place";
  label: string;
  detail: string;
  href: string;
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

  for (const board of listBoards()) {
    const href = boardHref(board.mode, board.region.id);
    const detail = `${MODES[board.mode].label} · ${board.region.name}`;
    if (normalizeName(detail).includes(q)) hits.push({ kind: "board", label: detail, detail: "Board", href, rank: 1 });

    if (MODES[board.mode].viewport) continue; // thousands of stops named "Main St" are not universal-search material
    for (const place of await getPlaces(board)) {
      const name = normalizeName(place.name);
      if (name.includes(q)) {
        hits.push({ kind: "place", label: place.name, detail, href: placeHref(href, place.id), rank: name.startsWith(q) ? 0 : 2 });
      }
    }
  }
  return hits
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
    .slice(0, LIMIT)
    .map(({ kind, label, detail, href }) => ({ kind, label, detail, href }));
}
