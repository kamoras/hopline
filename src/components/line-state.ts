import type { LineState } from "@/domain/line-status";

/** How each state is marked. Never color alone: every state has a symbol and a label. */
export const LINE_STATE_STYLE: Record<LineState, { mark: string; chip: string }> = {
  good: { mark: "", chip: "bg-ok-bg text-ok" },
  planned: { mark: "i", chip: "bg-idle-bg text-idle" },
  change: { mark: "~", chip: "bg-warn-bg text-warn" },
  delays: { mark: "!", chip: "bg-warn-bg text-warn" },
  suspended: { mark: "×", chip: "bg-bad-bg text-bad" },
};
