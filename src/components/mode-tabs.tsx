"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { nearestBoard, type BoardLink } from "@/domain/board";
import { MODES, type Mode } from "@/domain/modes";
import type { LatLon } from "@/lib/geo";

interface Props {
  mode: Mode;
  regionId: string;
  boards: readonly BoardLink[];
  /** Where the map is looking right now, so a tab opens the board for that place. */
  viewCenter(): LatLon | undefined;
}

/**
 * Always-visible tabs for the modes available (Rail, Subway, later Flights): one tap, no menu. The area
 * carries over: a tab opens the board of that mode for wherever the map is looking. Real links, so they
 * work without JavaScript, open in a new tab, and fall back to the current area's board.
 */
export function ModeTabs({ mode, regionId, boards, viewCenter }: Props) {
  const router = useRouter();
  const current = boards.find((b) => b.mode === mode && b.regionId === regionId);
  const modes = [...new Set(boards.map((b) => b.mode))];
  if (modes.length < 2) return null;

  const fallback = current && { lat: current.center[1], lon: current.center[0] };
  return (
    <nav aria-label="Mode" className="mx-auto flex max-w-[1500px] gap-1 px-4 pb-2">
      {modes.map((m) => {
        const target = nearestBoard(boards, m, fallback ?? { lat: 0, lon: 0 });
        const active = m === mode;
        return (
          <Link
            key={m}
            href={target?.href ?? "/"}
            aria-current={active ? "page" : undefined}
            onClick={(e) => {
              if (active || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              const at = viewCenter();
              const best = at && nearestBoard(boards, m, at);
              if (best && best.href !== target?.href) {
                e.preventDefault();
                router.push(best.href);
              }
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${active ? "bg-accent text-on-accent" : "text-muted hover:bg-surface-2 hover:text-text"}`}
          >
            {MODES[m].label}
          </Link>
        );
      })}
    </nav>
  );
}
