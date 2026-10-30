import { describe, expect, it } from "vitest";
import { classifyDelay, formatDelay, inferDelayReason } from "@/domain/delay";
import type { StopCall } from "@/domain/trip";

const stop = (name: string, delayMinutes?: number): StopCall => ({
  id: name,
  name,
  state: "departed",
  delayMinutes,
});

describe("classifyDelay", () => {
  it("buckets by minutes", () => {
    expect(classifyDelay(0, "enroute")).toBe("on-time");
    expect(classifyDelay(4, "enroute")).toBe("on-time");
    expect(classifyDelay(5, "enroute")).toBe("minor");
    expect(classifyDelay(14, "enroute")).toBe("minor");
    expect(classifyDelay(15, "enroute")).toBe("major");
    expect(classifyDelay(undefined, "enroute")).toBe("unknown");
    expect(classifyDelay(0, "canceled")).toBe("canceled");
  });
});

describe("formatDelay", () => {
  it("renders short labels", () => {
    expect(formatDelay(0, "on-time")).toBe("On time");
    expect(formatDelay(12, "minor")).toBe("+12 min");
    expect(formatDelay(75, "major")).toBe("+1h 15m");
    expect(formatDelay(undefined, "unknown")).toBe("No live data");
  });
});

describe("inferDelayReason", () => {
  it("returns nothing for on-time trips", () => {
    expect(inferDelayReason([stop("A", 0), stop("B", 2)])).toBeUndefined();
  });
  it("reports a late departure from the first known stop", () => {
    expect(inferDelayReason([stop("New Haven", 9), stop("Stamford", 9)])?.text).toBe("Left New Haven 9 min late");
  });
  it("does not claim a trip has left when it hasn't", () => {
    const waiting: StopCall = { ...stop("Grand Central", 12), state: "upcoming" };
    expect(inferDelayReason([waiting])?.text).toBe("Running 12 min behind at Grand Central");
  });
  it("finds where the time was lost", () => {
    const r = inferDelayReason([stop("A", 0), stop("Stamford", 1), stop("Greenwich", 11), stop("Rye", 12)]);
    expect(r).toEqual({ kind: "inferred", text: "Lost 10 min between Stamford and Greenwich" });
  });
});
