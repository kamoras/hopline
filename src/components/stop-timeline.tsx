"use client";

import { forwardRef, useEffect, useRef } from "react";
import type { Region } from "@/domain/region";
import type { StopCall } from "@/domain/trip";
import { formatRelative } from "@/lib/format";
import { StopTime } from "./trip-parts";

type Phase = "visited" | "here" | "next" | "upcoming";

/** Where each stop sits relative to the trip: passed, the train is here, the next one, or still ahead. */
export function stopPhases(stops: readonly StopCall[]): Phase[] {
  const nextIdx = stops.findIndex((s) => s.state === "upcoming");
  return stops.map((s, i) => (s.state === "departed" ? "visited" : s.state === "at" ? "here" : i === nextIdx ? "next" : "upcoming"));
}

interface Props {
  stops: readonly StopCall[];
  routeColor: string;
  region: Region;
  now: number;
}

/**
 * The stop list as a journey: passed stops are filled and muted, the train's current stop or the next
 * one is highlighted with a countdown, and the track ahead is dashed. Scrolls to the train's stop if it's below the fold.
 */
export function StopTimeline({ stops, routeColor, region, now }: Props) {
  const phases = stopPhases(stops);
  const focusRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    // Only scroll if the train's stop is off screen, so the status and delay reason above stay visible.
    focusRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const passed = phases.filter((p) => p === "visited").length;
  const here = phases.includes("here");
  const nextIdx = phases.findIndex((p) => p === "next" || p === "here");
  const next = stops[nextIdx];
  const progress = stops.length > 1 ? ((passed + (here ? 0.5 : 0)) / stops.length) * 100 : 0;
  const nextWhen = next?.arrival ?? next?.departure;

  return (
    <section aria-label="Stops">
      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold">
            {passed} of {stops.length} stops passed
          </span>
          {next && nextWhen !== undefined && (
            <span className="tabular truncate text-muted">
              {here ? "At" : "Next"} {next.name} · {formatRelative(nextWhen, now)}
            </span>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${progress}%`, background: routeColor }} />
        </div>
      </div>

      <ol>
        {stops.map((stop, i) => (
          <StopItem
            key={`${stop.id}-${i}`}
            ref={phases[i] === "here" || phases[i] === "next" ? (phases[i - 1] === "here" ? undefined : focusRef) : undefined}
            stop={stop}
            phase={phases[i]!}
            nextPhase={phases[i + 1]}
            isLast={i === stops.length - 1}
            routeColor={routeColor}
            region={region}
            now={now}
          />
        ))}
      </ol>
    </section>
  );
}


interface ItemProps {
  stop: StopCall;
  phase: Phase;
  nextPhase?: Phase;
  isLast: boolean;
  routeColor: string;
  region: Region;
  now: number;
}

const DOT = { visited: 18, here: 24, next: 22, upcoming: 14 } as const;
const CENTER_Y = 22; // px from the top of a row to the middle of its dot

const StopItem = forwardRef<HTMLLIElement, ItemProps>(function StopItem(
  { stop, phase, nextPhase, isLast, routeColor, region, now },
  ref,
) {
  const size = DOT[phase];
  const focus = phase === "here" || phase === "next";
  const when = stop.arrival ?? stop.departure;
  // The segment below this stop: solid once travelled, fading out toward the stop the train is heading
  // for, dashed while still ahead.
  const segment =
    phase === "visited" && (nextPhase === "visited" || nextPhase === "here")
      ? { background: routeColor }
      : phase === "visited" && nextPhase === "next"
        ? { backgroundImage: `linear-gradient(to bottom, ${routeColor} 0 35%, var(--line))` }
        : { backgroundImage: "repeating-linear-gradient(to bottom, var(--line) 0 5px, transparent 5px 9px)" };

  return (
    <li ref={ref} className="relative grid grid-cols-[28px_1fr] gap-x-3" aria-current={focus ? "step" : undefined}>
      {/* rail */}
      <div className="relative">
        {!isLast && (
          <span
            aria-hidden
            className="absolute left-1/2 w-[3px] -translate-x-1/2"
            style={{ top: CENTER_Y, bottom: -CENTER_Y, ...segment }}
          />
        )}
        <span
          aria-hidden
          className={`absolute left-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 ${
            phase === "visited"
              ? "border-transparent text-white"
              : phase === "upcoming"
                ? "border-line bg-surface"
                : "border-accent bg-surface"
          } ${phase === "here" ? "live-dot" : ""}`}
          style={{ top: CENTER_Y, width: size, height: size, ...(phase === "visited" ? { background: routeColor } : {}) }}
        >
          {phase === "visited" && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5 10 17.5 19 7" />
            </svg>
          )}
          {focus && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
        </span>
      </div>

      {/* content */}
      <div className={`my-1 min-w-0 rounded-xl px-3 py-2 ${focus ? "bg-accent/10" : ""} ${phase === "visited" ? "text-muted" : ""}`}>
        <div className="flex items-baseline justify-between gap-3">
          <span className={`truncate ${focus ? "text-base font-semibold" : "text-[15px]"}`}>
            {stop.name}
            {phase === "visited" && <span className="sr-only"> (passed)</span>}
          </span>
          <span className="tabular shrink-0 text-sm">
            <StopTime stop={stop} region={region} emphasize={phase !== "visited"} showScheduled={phase !== "visited"} />
          </span>
        </div>
        {focus && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs font-semibold tracking-wide text-accent uppercase">
            <span>{phase === "here" ? "Here now" : when !== undefined ? `Next · ${formatRelative(when, now)}` : "Next"}</span>
            {stop.platform && <span className="text-muted normal-case">Platform {stop.platform}</span>}
          </div>
        )}
      </div>
    </li>
  );
});
