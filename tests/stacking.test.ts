import { describe, expect, it } from "vitest";
import { groupStacks, type StackPoint } from "@/components/map/stacking";

const p = (id: string, x: number, y: number, pinned = false): StackPoint => ({ id, x, y, pinned });

describe("groupStacks", () => {
  it("collapses a crowd into one stack", () => {
    const stacks = groupStacks([p("a", 0, 0), p("b", 5, 3), p("c", 8, 8), p("d", 200, 200)], 16);
    expect(stacks).toEqual([{ ids: ["a", "b", "c"] }]);
  });

  it("leaves small groups as individual markers", () => {
    expect(groupStacks([p("a", 0, 0), p("b", 5, 3)], 16)).toEqual([]);
  });

  it("never absorbs pinned markers such as delayed trains", () => {
    const stacks = groupStacks([p("a", 0, 0), p("b", 3, 3), p("c", 6, 6), p("late", 4, 4, true)], 16);
    expect(stacks).toEqual([{ ids: ["a", "b", "c"] }]);
  });

  it("is deterministic regardless of input order", () => {
    const pts = [p("c", 8, 8), p("a", 0, 0), p("b", 5, 3)];
    expect(groupStacks(pts, 16)).toEqual(groupStacks([...pts].reverse(), 16));
  });

  it("forms several stacks when several crowds exist", () => {
    const pts = [p("a", 0, 0), p("b", 2, 2), p("c", 4, 4), p("x", 300, 300), p("y", 302, 301), p("z", 305, 305)];
    expect(groupStacks(pts, 16)).toHaveLength(2);
  });
});

describe("groupStacks at scale", () => {
  // The straightforward O(n²) version, as the reference the grid must agree with.
  function reference(points: readonly StackPoint[], radius: number, minSize = 3) {
    const free = points.filter((q) => !q.pinned).sort((a, b) => a.id.localeCompare(b.id));
    const taken = new Set<string>();
    const out: { ids: string[] }[] = [];
    for (const seed of free) {
      if (taken.has(seed.id)) continue;
      const members = free.filter((q) => !taken.has(q.id) && Math.hypot(q.x - seed.x, q.y - seed.y) <= radius);
      if (members.length >= minSize) {
        members.forEach((m) => taken.add(m.id));
        out.push({ ids: members.map((m) => m.id) });
      }
    }
    return out;
  }

  it("matches the brute-force result on dense random maps", () => {
    let seed = 12345;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (const n of [50, 400, 3000]) {
      const pts = Array.from({ length: n }, (_, i) => p(`p${i}`, rand() * 600 - 100, rand() * 400 - 100, rand() < 0.05));
      expect(groupStacks(pts, 22)).toEqual(reference(pts, 22));
    }
  });

  it("handles a national-sized map in well under a second", () => {
    const pts = Array.from({ length: 50_000 }, (_, i) => p(`p${i}`, (i * 37) % 4000, (i * 91) % 3000));
    const start = performance.now();
    groupStacks(pts, 22);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
