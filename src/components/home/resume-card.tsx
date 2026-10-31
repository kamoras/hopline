"use client";

import Link from "next/link";
import type { BoardLink } from "@/domain/board";
import { MODES } from "@/domain/modes";
import { useLastBoard } from "@/hooks/use-last-board";

/** "Continue where you left off", from this device's memory of the last board. */
export function ResumeCard({ boards }: { boards: BoardLink[] }) {
  const lastHref = useLastBoard();
  const last = boards.find((b) => b.href === lastHref);
  if (!last) return null;
  return (
    <Link href={last.href} className="flex items-center justify-between rounded-2xl bg-accent px-5 py-4 text-on-accent shadow-lg">
      <span>
        <span className="block text-xs font-semibold tracking-wide uppercase opacity-80">Continue</span>
        <span className="text-lg font-bold">
          {MODES[last.mode].label} · {last.regionName}
        </span>
      </span>
      <span aria-hidden className="text-2xl">→</span>
    </Link>
  );
}
