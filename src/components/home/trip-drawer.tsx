"use client";

import { useEffect, useRef } from "react";
import type { BoardLink } from "@/domain/board";
import { LINE_STATE_LABEL } from "@/domain/line-status";
import { MODES } from "@/domain/modes";
import { getRegion, NORTHEAST } from "@/domain/region";
import type { Trip } from "@/domain/trip";
import { useLineStatus } from "@/hooks/use-line-status";
import { usePinned } from "@/hooks/use-pinned";
import { useTripDetail } from "@/hooks/use-trip-detail";
import { pinKey } from "@/lib/search";
import { TripDetailBody, TripHeader } from "../trip-detail";

/** Everything about one vehicle and the route it is on, while the camera follows it. */
export function TripDrawer({
  trip: polled,
  gone,
  board,
  now,
  following,
  onFollow,
}: {
  trip: Trip;
  /** The vehicle has dropped out of the feed (finished its run, or out of range): what we last knew is shown. */
  gone: boolean;
  board: BoardLink;
  now: number;
  following: boolean;
  onFollow(): void;
}) {
  // The map polls vehicles without their stops; the open one is asked for in full (and keeps its last full answer if it leaves).
  const detail = useTripDetail(board, polled);
  const trip = detail && detail.id === polled.id ? { ...polled, ...detail, position: polled.position ?? detail.position } : polled;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), [trip.id]);
  const { pinned, toggle } = usePinned();
  const region = getRegion(board.regionId) ?? NORTHEAST;
  const mode = MODES[trip.mode];
  const status = useLineStatus(board.mode, board.regionId, true);
  const alerts = status.lines.filter((l) => l.state !== "good" && (l.route === trip.number || l.route === trip.routeName));

  return (
    <div className="space-y-4">
      <TripHeader trip={trip} headingRef={heading} />
      {gone && <p role="status" className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">This {mode.noun} is no longer on the map. This is what we last knew.</p>}
      {trip.position && !gone && (
        <button
          type="button"
          onClick={onFollow}
          aria-pressed={following}
          disabled={following}
          className={`press w-full rounded-xl px-4 py-2.5 text-sm font-semibold ${following ? "bg-accent/15 text-accent" : "border border-line hover:bg-surface-2"}`}
        >
          {following ? "● Following · drag the map to let go" : "◎ Follow on the map"}
        </button>
      )}
      <TripDetailBody
        trip={trip}
        region={region}
        now={now}
        pinned={pinned.includes(pinKey(trip))}
        onTogglePin={() => toggle(pinKey(trip))}
        extra={[
          ...(!detail ? [<div key="loading" className="skeleton h-16 rounded-2xl" role="status" aria-label="Loading stops" />] : []),
          ...alerts.map((l) => (
            <div key={l.route} role="status" className="rounded-2xl bg-warn-bg px-3 py-2.5 text-sm text-warn">
              <span className="font-semibold">{LINE_STATE_LABEL[l.state]} on this {mode.lineNoun}:</span> {l.alerts[0]?.headline}
            </div>
          )),
        ]}
      />
    </div>
  );
}
