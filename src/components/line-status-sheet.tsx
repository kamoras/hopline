"use client";

import { useEffect } from "react";
import { LINE_STATE_LABEL, type LineStatus } from "@/domain/line-status";
import { LineBadge } from "./line-badge";
import { LINE_STATE_STYLE } from "./line-state";

/** One line's service picture: its state and every active alert, with the full text. */
export function LineStatusSheet({ line, onClose }: { line: LineStatus; onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-end lg:items-stretch lg:justify-end" role="dialog" aria-modal="true" aria-label={`${line.route} line status`}>
      <button type="button" className="absolute inset-0 bg-black/40 lg:bg-transparent" aria-label="Close" onClick={onClose} />
      <div className="sheet-in relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2xl lg:max-h-none lg:w-[420px] lg:rounded-none lg:rounded-l-3xl">
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="flex items-center gap-3">
            <LineBadge route={line.route} color={line.color} textColor={line.textColor} size={44} />
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{line.route} line</h2>
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${LINE_STATE_STYLE[line.state].chip}`}>{LINE_STATE_LABEL[line.state]}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl text-muted hover:bg-surface-2">
            ×
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-5 pb-5">
          {line.alerts.length === 0 ? (
            <p className="text-sm text-muted">No active alerts for the {line.route} line.</p>
          ) : (
            line.alerts.map((a) => (
              <article key={a.headline} className="rounded-2xl bg-surface-2 p-4">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${LINE_STATE_STYLE[a.state].chip}`}>{LINE_STATE_LABEL[a.state]}</span>
                <h3 className="mt-2 font-semibold">{a.headline}</h3>
                {a.detail && <p className="mt-1 text-sm whitespace-pre-line text-muted">{a.detail}</p>}
              </article>
            ))
          )}
          <p className="text-xs text-muted">Source: MTA service alerts.</p>
        </div>
      </div>
    </div>
  );
}
