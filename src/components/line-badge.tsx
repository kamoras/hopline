/**
 * A line bullet: the line's letter or number in its own colors. Longer codes (an airport or an airline,
 * "JFK") get a pill that grows to fit instead of a circle that clips them.
 */
export function LineBadge({ route, color, textColor, size = 28, label }: { route: string; color: string; textColor: string; size?: number; label?: string }) {
  const long = route.length > 2;
  return (
    <span
      className={`inline-grid shrink-0 place-items-center font-bold tabular-nums ${long ? "rounded-full px-[0.45em]" : "rounded-full"}`}
      style={{ ...(long ? { minWidth: size } : { width: size }), height: size, background: color, color: textColor, fontSize: size * (long ? 0.38 : 0.5) }}
      aria-label={label ?? `${route} line`}
    >
      {route}
    </span>
  );
}
