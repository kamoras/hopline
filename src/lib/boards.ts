import type { BoardLink } from "@/domain/board";
import type { BBox } from "./bbox";

const intersects = ([w, s, e, n]: BBox, [w2, s2, e2, n2]: readonly [number, number, number, number]) => w <= e2 && e >= w2 && s <= n2 && n >= s2;

/** The boards whose area overlaps a rectangle: what the browser needs to know about when it looks at that part of the map. */
export const boardsIn = (boards: readonly BoardLink[], box: BBox): BoardLink[] => boards.filter((b) => intersects(box, b.bounds));

/** The most boards one answer carries (a continent-wide view asks for the map, not for every board). */
export const MAX_BOARDS_PER_ANSWER = 300;
