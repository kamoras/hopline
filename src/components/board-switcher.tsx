import Link from "next/link";
import type { BoardLink } from "@/domain/board";
import { MODES, type Mode } from "@/domain/modes";

/**
 * Header title showing the current board, with a menu to choose another area for the same mode
 * (the mode tabs switch modes). Plain links and a native <details>, so it works without JavaScript
 * and scales to many boards. With one area it is just a label.
 */
export function BoardSwitcher({ mode, regionId, boards }: { mode: Mode; regionId: string; boards: BoardLink[] }) {
  const current = boards.find((b) => b.mode === mode && b.regionId === regionId);
  // The mode is the tab row's job; the title says where.
  const title = <span className="text-base leading-tight font-bold tracking-tight sm:text-lg">{current?.regionName ?? MODES[mode].label}</span>;
  const subtitle = null;
  const areas = boards.filter((b) => b.mode === mode);
  if (areas.length < 2) {
    return (
      <div className="flex flex-col">
        {title}
        {subtitle}
      </div>
    );
  }

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none flex-col rounded-lg px-2 py-0.5 hover:bg-surface-2">
        <span className="flex items-center gap-1">
          {title}
          <span aria-hidden className="text-muted">▾</span>
        </span>
        {subtitle}
      </summary>
      <nav aria-label={`${MODES[mode].label} areas`} className="absolute top-full left-0 z-40 mt-2 w-72 rounded-2xl border border-line bg-surface p-2 shadow-xl">
        <Link href="/" className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2">
          All boards
        </Link>
        {areas.map((b) => (
          <Link
            key={b.href}
            href={b.href}
            aria-current={b.regionId === regionId ? "page" : undefined}
            className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-2 aria-[current=page]:text-accent"
          >
            {b.regionName}
          </Link>
        ))}
      </nav>
    </details>
  );
}
