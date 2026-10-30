"use client";

import { useEffect } from "react";
import type { Mode } from "@/domain/modes";
import { MODES } from "@/domain/modes";
import type { Place } from "@/domain/place";
import { LINE_STATE_LABEL, type LineStatus } from "@/domain/line-status";
import { useArrivals } from "@/hooks/use-arrivals";
import { groupArrivals, minutesUntil } from "@/lib/arrivals";
import { LineBadge } from "./line-badge";

interface Props {
  mode: Mode;
  regionId: string;
  place: Place;
  now: number;
  /** How each line is running, to flag trouble on the lines serving this station. */
  lineStatus: readonly LineStatus[];
  onClose(): void;
}

const when = (at: number, now: number) => {
  const m = minutesUntil(at, now);
  return m === 0 ? "Due" : `${m} min`;
};

/**
 * What a rider at a station wants to know: the next trains, by line and direction. Live, so it
 * refreshes while open; groups warn about unusually long waits.
 */
export function ArrivalsSheet({ mode, regionId, place, now, lineStatus, onClose }: Props) {
  const { arrivals, error, isLoading } = useArrivals(mode, regionId, place.id);
  const groups = groupArrivals(arrivals, now);
  const lines = [...new Map(groups.map((g) => [g.route, g])).values()];
  const vocab = MODES[mode];
  const troubled = lineStatus.filter((l) => l.state !== "good" && lines.some((g) => g.route === l.route));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-end lg:items-stretch lg:justify-end" role="dialog" aria-modal="true" aria-label={`${place.name} arrivals`}>
      <button type="button" className="absolute inset-0 bg-black/40 lg:bg-transparent" aria-label="Close" onClick={onClose} />
      <div className="sheet-in relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2xl lg:max-h-none lg:w-[420px] lg:rounded-none lg:rounded-l-3xl">
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="min-w-0">
            <div className="text-sm text-muted">Next {vocab.nounPlural} at</div>
            <h2 className="text-2xl font-bold tracking-tight">{place.name}</h2>
            {lines.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Lines serving this station">
                {lines.map((g) => (
                  <LineBadge key={g.route} route={g.route} color={g.color} textColor={g.textColor} size={24} />
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl text-muted hover:bg-surface-2">
            ×
          </button>
        </div>

        <div className="space-y-2 overflow-y-auto px-3 pb-5">
          {troubled.map((l) => (
            <div key={l.route} className="flex items-start gap-2.5 rounded-2xl bg-warn-bg px-3 py-2.5 text-sm text-warn" role="status">
              <LineBadge route={l.route} color={l.color} textColor={l.textColor} size={20} />
              <span>
                <span className="font-semibold">{LINE_STATE_LABEL[l.state]}:</span> {l.alerts[0]?.headline}
              </span>
            </div>
          ))}
          {isLoading && groups.length === 0 && (
            <div className="space-y-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-16 rounded-2xl" />
              ))}
            </div>
          )}
          {error && groups.length === 0 && <p className="px-2 text-sm text-muted">Couldn&apos;t load arrivals right now. We&apos;ll keep trying.</p>}
          {!isLoading && !error && groups.length === 0 && (
            <p className="px-2 text-sm text-muted">No {vocab.nounPlural} due in the next 45 minutes. Overnight and weekend service can be much less frequent.</p>
          )}
          {groups.map((g) => (
            <section key={g.key} className="rounded-2xl border border-line p-3" aria-label={`${g.route} to ${g.headsign}`}>
              <div className="flex items-center gap-3">
                <LineBadge route={g.route} color={g.color} textColor={g.textColor} />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 leading-snug font-semibold">to {g.headsign}</div>
                  {g.warning && <div className="text-xs font-medium text-warn">{g.warning}</div>}
                </div>
                <div className="tabular text-right">
                  <div className="text-xl font-bold leading-tight">{when(g.times[0]!, now)}</div>
                  {g.times.length > 1 && <div className="text-xs text-muted">then {g.times.slice(1).map((t) => minutesUntil(t, now)).join(", ")} min</div>}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
