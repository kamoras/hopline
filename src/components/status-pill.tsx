import { formatDelay } from "@/domain/delay";
import type { DelayStatus } from "@/domain/trip";

const STYLE: Record<DelayStatus, { cls: string; icon: string }> = {
  "on-time": { cls: "bg-ok-bg text-ok", icon: "✓" },
  minor: { cls: "bg-warn-bg text-warn", icon: "!" },
  major: { cls: "bg-bad-bg text-bad", icon: "!" },
  canceled: { cls: "bg-bad-bg text-bad", icon: "✕" },
  unknown: { cls: "bg-idle-bg text-idle", icon: "·" },
};

/** Status is conveyed by icon and text as well as color. */
export function StatusPill({ status, minutes, size = "md" }: { status: DelayStatus; minutes?: number; size?: "md" | "lg" }) {
  const { cls, icon } = STYLE[status];
  const pad = size === "lg" ? "px-3.5 py-1.5 text-base" : "px-2.5 py-1 text-sm";
  return (
    <span className={`tabular inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ${cls} ${pad}`}>
      <span aria-hidden>{icon}</span>
      {formatDelay(minutes, status)}
    </span>
  );
}
