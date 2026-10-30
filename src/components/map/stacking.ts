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
 */
export function groupStacks(points: readonly StackPoint[], radius: number, minSize = 3): Stack[] {
  const free = points.filter((p) => !p.pinned).sort((a, b) => a.id.localeCompare(b.id));
  const taken = new Set<string>();
  const stacks: Stack[] = [];
  for (const seed of free) {
    if (taken.has(seed.id)) continue;
    const members = free.filter((p) => !taken.has(p.id) && Math.hypot(p.x - seed.x, p.y - seed.y) <= radius);
    if (members.length >= minSize) {
      for (const m of members) taken.add(m.id);
      stacks.push({ ids: members.map((m) => m.id) });
    }
  }
  return stacks;
}
