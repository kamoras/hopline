import { LINE_STATE_LABEL, type LineState, type LineStatus } from "@/domain/line-status";
import { LineBadge } from "./line-badge";
import { LINE_STATE_STYLE } from "./line-state";

const count = (lines: readonly LineStatus[], s: LineState) => lines.filter((l) => l.state === s).length;

/** One sentence for the whole system, worst news first. */
export function statusSummary(lines: readonly LineStatus[]): string {
  const parts = [
    [count(lines, "suspended"), "suspended"],
    [count(lines, "delays"), "with delays"],
    [count(lines, "change"), "with service changes"],
    [count(lines, "planned"), "with planned work"],
  ].filter(([n]) => (n as number) > 0).map(([n, label]) => `${n} ${label}`);
  return parts.length ? parts.join(" · ") : "Good service on all lines";
}

/**
 * The whole system at a glance: every line as a bullet, marked when something is wrong. Tapping one
 * opens its alerts. Unknown status is said out loud, never shown as "good".
 */
export function LineStatusStrip({ lines, unavailable, loading, onOpen }: { lines: readonly LineStatus[]; unavailable: boolean; loading: boolean; onOpen(route: string): void }) {
  if (unavailable) {
    return <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Service status is unavailable right now.</p>;
  }
  if (loading && lines.length === 0) {
    return <div className="skeleton h-16 rounded-2xl" aria-hidden />;
  }
  if (lines.length === 0) return null;
  return (
    <section aria-label="Service status" className="rounded-2xl border border-line bg-surface p-3">
      <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Service status</h2>
      <p className="mt-0.5 text-sm font-medium" role="status">
        {statusSummary(lines)}
      </p>
      <ul className="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 pt-1 pb-1 [scrollbar-width:none]">
        {lines.map((l) => {
          const { mark, chip } = LINE_STATE_STYLE[l.state];
          return (
            <li key={l.route} className="relative shrink-0">
              <button
                type="button"
                onClick={() => onOpen(l.route)}
                aria-label={`${l.route} line: ${LINE_STATE_LABEL[l.state]}`}
                className={`press rounded-full ${l.state === "good" ? "opacity-90" : ""}`}
              >
                <LineBadge route={l.route} color={l.color} textColor={l.textColor} size={32} />
              </button>
              {mark && (
                <span aria-hidden className={`absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full text-[10px] leading-none font-black ring-2 ring-surface ${chip}`}>
                  {mark}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
