"use client";

import Link from "next/link";
import { MODES, type Mode } from "@/domain/modes";
import { useConnections } from "@/hooks/use-connections";
import type { Connection } from "@/server/connections";

const CHIP = "inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2";

/** "Also here": the same interchange on another board (a station's metro, trains, flights). */
export function Connections({
  mode,
  regionId,
  placeId,
  className = "",
  onOpen,
}: {
  mode: Mode;
  regionId: string;
  placeId: string;
  className?: string;
  /** Open the connection in place (the home app); without it each is a link to its board. */
  onOpen?(c: Connection): void;
}) {
  const connections = useConnections(mode, regionId, placeId);
  if (connections.length === 0) return null;
  return (
    <section aria-label="Connections" className={className}>
      <div className="text-xs font-semibold tracking-wide text-muted uppercase">Also here</div>
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {connections.map((c) => (
          <li key={`${c.regionId}/${c.mode}/${c.placeId}`}>
            {onOpen ? (
              <button type="button" onClick={() => onOpen(c)} className={CHIP}>
                <span className="text-muted">{MODES[c.mode].label}</span>
                <span>{c.name}</span>
                <span aria-hidden>→</span>
              </button>
            ) : (
              <Link href={c.href} className={CHIP}>
                <span className="text-muted">{MODES[c.mode].label}</span>
                <span>{c.name}</span>
                <span aria-hidden>→</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
