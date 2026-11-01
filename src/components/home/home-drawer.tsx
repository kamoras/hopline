"use client";

import { MODES } from "@/domain/modes";
import { getRegion, NORTHEAST } from "@/domain/region";
import type { Place } from "@/domain/place";
import type { Trip } from "@/domain/trip";
import { describeLeg, routeKey, type Route } from "@/lib/query";
import { commuteMatches } from "@/lib/commute";
import { pinKey } from "@/lib/search";
import { parseWorldPlaceId } from "@/lib/world";
import { destinationPhrase, StopTime } from "../trip-parts";
import type { PlaceTarget } from "./model-home";

type Saved = Route & { board: string };

/**
 * What the search box holds before anything is typed: the things a person comes back for. Their pinned vehicles and saved
 * commutes (kept on this device only), and the stations nearest to them (their location is used here and never leaves it).
 */
export function HomeDrawer({
  trips,
  pinned,
  commutes,
  boardOfTrip,
  near,
  nearPlaces,
  now,
  onNearMe,
  onOpenTrip,
  onOpenPlace,
  onUnpin,
  onRemoveCommute,
  onOpenCommute,
}: {
  trips: readonly Trip[];
  /** Pin keys (`operator:number`). */
  pinned: readonly string[];
  commutes: readonly Saved[];
  /** The `mode/region` a trip belongs to, to tell which board a commute is about. */
  boardOfTrip(tripId: string): string | undefined;
  near: "idle" | "asking" | "denied" | "ready";
  nearPlaces: readonly Place[];
  now: number;
  onNearMe(): void;
  onOpenTrip(id: string): void;
  onOpenPlace(place: PlaceTarget): void;
  onUnpin(key: string): void;
  onRemoveCommute(c: Saved): void;
  onOpenCommute(c: Saved): void;
}) {
  const running = new Map(trips.map((t) => [pinKey(t), t]));
  return (
    <div className="space-y-6">
      <h2 tabIndex={-1} className="text-lg font-bold tracking-tight outline-none">
        Your places
      </h2>

      <section aria-label="Near me" className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Near me</h3>
        <button type="button" onClick={onNearMe} disabled={near === "asking"} className="press w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
          {near === "asking" ? "Locating…" : near === "denied" ? "Location unavailable. Try again" : "◎ Find stations near me"}
        </button>
        <p className="text-xs text-muted">Your location stays on this device.</p>
        {nearPlaces.length > 0 && (
          <ul className="space-y-2">
            {nearPlaces.map((p) => {
              const parsed = parseWorldPlaceId(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => parsed && onOpenPlace({ id: parsed.placeId, name: p.name, mode: parsed.mode, regionId: parsed.regionId, lat: p.lat, lon: p.lon })}
                    className="press flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    <span className="shrink-0 text-xs text-muted">{MODES[p.mode].label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="My commutes" className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">⇄ My commutes</h3>
        {commutes.length === 0 && <p className="text-sm text-muted">Search “Stamford to Grand Central” and save it to see its next trains here.</p>}
        {commutes.map((c) => (
          <CommuteCard key={`${c.board}/${routeKey(c)}`} commute={c} trips={trips} boardOfTrip={boardOfTrip} now={now} onOpenTrip={onOpenTrip} onRemove={() => onRemoveCommute(c)} onOpen={() => onOpenCommute(c)} />
        ))}
      </section>

      <section aria-label="My vehicles" className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">★ My vehicles</h3>
        {pinned.length === 0 && <p className="text-sm text-muted">Open a train, bus or flight and tap “Add to My…” to keep it here.</p>}
        <ul className="space-y-2">
          {pinned.map((key) => {
            const t = running.get(key);
            return (
              <li key={key} className="flex items-center gap-2">
                {t ? (
                  <button type="button" onClick={() => onOpenTrip(t.id)} className="press flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:bg-surface-2">
                    <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: t.routeColor }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="tabular font-semibold">{t.number}</span> <span className="text-muted">{destinationPhrase(t)}</span>
                    </span>
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 truncate rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-muted">
                    <span className="tabular font-semibold">{key.split(":").slice(1).join(":")}</span> is not running right now
                  </span>
                )}
                <button type="button" onClick={() => onUnpin(key)} aria-label={`Remove ${key.split(":").slice(1).join(":")} from My vehicles`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg text-muted hover:bg-surface-2">
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function CommuteCard({
  commute,
  trips,
  boardOfTrip,
  now,
  onOpenTrip,
  onRemove,
  onOpen,
}: {
  commute: Saved;
  trips: readonly Trip[];
  boardOfTrip(tripId: string): string | undefined;
  now: number;
  onOpenTrip(id: string): void;
  onRemove(): void;
  onOpen(): void;
}) {
  const region = getRegion(commute.board.split("/")[1] ?? "") ?? NORTHEAST;
  // The next trains between the two places, on the board it was saved on.
  const matches = commuteMatches(trips.filter((t) => boardOfTrip(t.id) === commute.board), commute, now).slice(0, 3);
  return (
    <div className="rounded-2xl border border-line p-2">
      <div className="flex items-center justify-between px-2 pt-1">
        <button type="button" onClick={onOpen} className="text-left font-semibold hover:text-accent">
          {describeLeg(commute)}
        </button>
        <button type="button" onClick={onRemove} aria-label={`Remove commute ${commute.from} to ${commute.to}`} className="rounded-full px-2 text-muted hover:bg-surface-2">
          ×
        </button>
      </div>
      {matches.length === 0 ? (
        <p className="px-2 py-2.5 text-sm text-muted">Nothing running on this route right now.</p>
      ) : (
        <ul className="mt-1">
          {matches.map(({ trip, from, to }) => (
            <li key={trip.id}>
              <button type="button" onClick={() => onOpenTrip(trip.id)} className="press flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: trip.routeColor }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  <span className="tabular font-semibold">{trip.number}</span> <span className="text-muted">{destinationPhrase(trip)}</span>
                </span>
                <span className="tabular shrink-0 text-sm">
                  <StopTime stop={from} region={region} emphasize={false} showScheduled={false} />
                  {" → "}
                  <StopTime stop={to} region={region} emphasize={false} showScheduled={false} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
