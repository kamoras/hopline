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
