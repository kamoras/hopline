/** A map marker in screen pixels. `pinned` markers (problems, the selected train) are never absorbed. */
export interface StackPoint {
  id: string;
  x: number;
  y: number;
  pinned: boolean;
}

export interface Stack {
  ids: string[];
}

/**
 * Collapses crowds of overlapping markers into stacks, so a terminal doesn't become an unreadable
 * pile. Greedy and deterministic: each unclaimed marker seeds a stack of every other unclaimed
 * marker within `radius` px; groups smaller than `minSize` stay as individual markers.
 *
 * Markers are bucketed into a grid of `radius`-sized cells, so a seed only looks at its own and the
 * eight neighboring cells rather than every marker on the map.
 */
export function groupStacks(points: readonly StackPoint[], radius: number, minSize = 3): Stack[] {
  const free = points.filter((p) => !p.pinned).sort((a, b) => a.id.localeCompare(b.id));
  const cells = new Map<string, number[]>(); // cell -> indexes into `free`, ascending
  const cellOf = (p: StackPoint) => [Math.floor(p.x / radius), Math.floor(p.y / radius)] as const;
  free.forEach((p, i) => {
    const key = cellOf(p).join(",");
    const cell = cells.get(key);
    if (cell) cell.push(i);
    else cells.set(key, [i]);
  });

  const taken = new Uint8Array(free.length);
  const stacks: Stack[] = [];
  free.forEach((seed, s) => {
    if (taken[s]) return;
    const [cx, cy] = cellOf(seed);
    const members: number[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (!taken[i] && Math.hypot(free[i]!.x - seed.x, free[i]!.y - seed.y) <= radius) members.push(i);
        }
      }
    }
    if (members.length >= minSize) {
      members.sort((a, b) => a - b); // id order, as before
      for (const i of members) taken[i] = 1;
      stacks.push({ ids: members.map((i) => free[i]!.id) });
    }
  });
  return stacks;
}
