/** A subway-style line bullet: the line's letter or number in its own colors. */
export function LineBadge({ route, color, textColor, size = 28 }: { route: string; color: string; textColor: string; size?: number }) {
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-bold tabular-nums"
      style={{ width: size, height: size, background: color, color: textColor, fontSize: size * 0.5 }}
      aria-label={`${route} line`}
    >
      {route}
    </span>
  );
}
