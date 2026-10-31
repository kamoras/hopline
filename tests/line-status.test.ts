import { transit_realtime as rt } from "gtfs-realtime-bindings";
import { describe, expect, it } from "vitest";
import { buildLineStatus, classifyAlert } from "@/providers/nyct/alerts";
import { loadNyctStatic } from "@/providers/nyct/static";

const { Effect } = rt.Alert;
const NOW = 1_800_000_000_000;
const sec = (ms: number) => Math.floor(ms / 1000);
const data = await loadNyctStatic();

const alert = (id: string, routes: string[], effect: rt.Alert.Effect, headline: string, extra: Partial<rt.IAlert> = {}): rt.IFeedEntity => ({
  id,
  alert: {
    effect,
    headerText: { translation: [{ text: headline, language: "en" }] },
    informedEntity: routes.map((routeId) => ({ routeId })),
    ...extra,
  },
});
const build = (entities: rt.IFeedEntity[]) => {
  const feed = rt.FeedMessage.decode(rt.FeedMessage.encode(rt.FeedMessage.create({ header: { gtfsRealtimeVersion: "2.0" }, entity: entities })).finish());
  return buildLineStatus({ staticData: data, feed, now: NOW });
};
const line = (statuses: ReturnType<typeof build>, route: string) => statuses.find((s) => s.route === route)!;

describe("classifyAlert", () => {
  it("maps feed effects to states", () => {
    expect(classifyAlert(Effect.NO_SERVICE, "No trains")).toBe("suspended");
    expect(classifyAlert(Effect.SIGNIFICANT_DELAYS, "x")).toBe("delays");
    expect(classifyAlert(Effect.DETOUR, "Trains are rerouted")).toBe("change");
  });
  it("recognizes delays and planned work from the text when the effect is vague", () => {
    expect(classifyAlert(Effect.OTHER_EFFECT, "Some northbound trains are running with delays")).toBe("delays");
    expect(classifyAlert(Effect.MODIFIED_SERVICE, "Weekend service changes: no trains between A and B")).toBe("planned");
  });
  it("ignores things that are not about running service", () => {
    expect(classifyAlert(Effect.ACCESSIBILITY_ISSUE, "Elevator at 14 St is out of service")).toBeUndefined();
    expect(classifyAlert(Effect.UNKNOWN_EFFECT, "Station notice")).toBeUndefined();
  });
});

describe("buildLineStatus", () => {
  it("reports every line, good unless an alert says otherwise", () => {
    const all = build([]);
    expect(all.map((s) => s.route).slice(0, 8)).toEqual(["1", "2", "3", "4", "5", "6", "7", "A"]);
    expect(all.every((s) => s.state === "good" && s.alerts.length === 0)).toBe(true);
    expect(line(all, "A")).toMatchObject({ color: "#0062CF", textColor: "#FFFFFF" });
  });

  it("takes the worst state among a line's alerts and keeps them worst-first", () => {
    const s = line(build([alert("1", ["A"], Effect.MODIFIED_SERVICE, "Weekend work on the A"), alert("2", ["A"], Effect.SIGNIFICANT_DELAYS, "A trains are delayed")]), "A");
    expect(s.state).toBe("delays");
    expect(s.alerts.map((a) => a.state)).toEqual(["delays", "planned"]);
  });

  it("rolls express and shuttle variants into their line", () => {
    const s = build([alert("1", ["6X"], Effect.NO_SERVICE, "No 6 express trains")]);
    expect(line(s, "6").state).toBe("suspended");
    expect(s.some((x) => x.route === "6X")).toBe(false);
  });

  it("applies one alert to every line it names, once per headline", () => {
    const s = build([alert("1", ["L", "G"], Effect.SIGNIFICANT_DELAYS, "Delays on the L and G"), alert("2", ["L"], Effect.SIGNIFICANT_DELAYS, "Delays on the L and G")]);
    expect(line(s, "L").alerts).toHaveLength(1);
    expect(line(s, "G").state).toBe("delays");
  });

  it("ignores alerts that are not active yet or already over", () => {
    const future = { activePeriod: [{ start: sec(NOW + 3_600_000) }] };
    const past = { activePeriod: [{ end: sec(NOW - 3_600_000) }] };
    const s = build([alert("1", ["A"], Effect.NO_SERVICE, "Later", future), alert("2", ["C"], Effect.NO_SERVICE, "Earlier", past)]);
    expect(line(s, "A").state).toBe("good");
    expect(line(s, "C").state).toBe("good");
  });

  it("ignores alerts that name no line (station notices)", () => {
    const s = build([{ id: "x", alert: { effect: Effect.SIGNIFICANT_DELAYS, headerText: { translation: [{ text: "Delay at a station", language: "en" }] }, informedEntity: [{ stopId: "127" }] } }]);
    expect(s.every((x) => x.state === "good")).toBe(true);
  });

  it("caps how many alerts a line carries", () => {
    const many = Array.from({ length: 9 }, (_, i) => alert(`${i}`, ["N"], Effect.SIGNIFICANT_DELAYS, `Delay ${i}`));
    expect(line(build(many), "N").alerts).toHaveLength(4);
  });
});
