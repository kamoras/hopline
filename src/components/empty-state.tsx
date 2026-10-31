import type { ReactNode } from "react";

type Art = "quiet" | "search" | "offline" | "lost";

/** Calm line-art for the moments when there's nothing to show. Colors follow the theme. */
function Art({ art }: { art: Art }) {
  return (
    <svg width="132" height="84" viewBox="0 0 132 84" fill="none" aria-hidden="true" className="mx-auto text-muted">
      <path d="M6 70h120" stroke="currentColor" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
      {[18, 38, 58, 78, 98, 118].map((x) => (
        <path key={x} d={`M${x} 66v8`} stroke="currentColor" strokeOpacity=".3" strokeWidth="2" strokeLinecap="round" />
      ))}
      {art === "quiet" && (
        <>
          <path d="M26 56c10-34 70-34 80 0" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 8" />
          <circle cx="26" cy="58" r="6" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
          <circle cx="106" cy="58" r="6" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
        </>
      )}
      {art === "search" && (
        <>
          <circle cx="62" cy="34" r="16" stroke="var(--accent)" strokeWidth="3.5" />
          <path d="m74 46 14 14" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M55 34h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {art === "offline" && (
        <>
          <path d="M30 40c20-18 52-18 72 0M44 52c12-10 32-10 44 0" stroke="currentColor" strokeOpacity=".5" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="66" cy="62" r="4" fill="var(--accent)" />
          <path d="m34 20 64 52" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
      {art === "lost" && (
        <>
          <path d="M20 58c14-10 22 10 38 0s22-24 38-12" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 8" />
          <circle cx="20" cy="58" r="6" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
          <path d="M98 30v22m0 6v.01" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function EmptyState({ art, title, body, action }: { art: Art; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <Art art={art} />
      <p className="mt-5 text-lg font-semibold tracking-tight">{title}</p>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
