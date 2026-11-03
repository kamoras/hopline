import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/boards/route";
import { toLink } from "@/domain/board";
import { BOSTON, NORTHEAST, NYC, PITTSBURGH } from "@/domain/region";
import { parseBbox } from "@/lib/bbox";
import { boardsIn } from "@/lib/boards";

const boards = [toLink({ mode: "subway", region: NYC }), toLink({ mode: "subway", region: BOSTON }), toLink({ mode: "bus", region: PITTSBURGH }), toLink({ mode: "rail", region: NORTHEAST })];

describe("boards by view", () => {
  it("gives only the boards that overlap what is on screen", () => {
    expect(boardsIn(boards, [-74.1, 40.65, -73.85, 40.85]).map((b) => b.href)).toEqual(["/metro/nyc", "/rail/northeast"]);
    expect(boardsIn(boards, [-80.1, 40.4, -79.9, 40.5]).map((b) => b.mode)).toEqual(["bus"]);
    expect(boardsIn(boards, [-120, 30, -119, 31])).toEqual([]);
  });

  it("lets a view be wider than a viewport query, but not a continent", () => {
    expect(parseBbox("-80,36,-70,46", 40)).toBeDefined();
    expect(parseBbox("-130,20,-60,50", 40)).toBeUndefined();
    expect(parseBbox("-80,36,-70,46")).toBeUndefined(); // the default limit is a neighborhood
  });
});

describe("/api/boards", () => {
  const ask = async (q: string) => GET(new Request(`http://x/api/boards?${q}`));

  it("answers for a view, for one board, and refuses a request with neither", async () => {
    const view = (await (await ask("bbox=-74.2,40.5,-73.7,40.9")).json()) as { href: string }[];
    expect(view.some((b) => b.href === "/metro/nyc")).toBe(true);
    expect(view.some((b) => b.href === "/metro/boston")).toBe(false);
    expect(await (await ask("board=subway/nyc")).json()).toHaveLength(1);
    expect(await (await ask("board=nope/x")).json()).toEqual([]);
    expect((await ask("")).status).toBe(400);
  });
});
