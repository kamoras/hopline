/** How a line is running, worst first when several alerts apply. */
export type LineState = "good" | "planned" | "change" | "delays" | "suspended";

export const LINE_STATE_RANK: Record<LineState, number> = { good: 0, planned: 1, change: 2, delays: 3, suspended: 4 };

export const LINE_STATE_LABEL: Record<LineState, string> = {
  good: "Good service",
  planned: "Planned work",
  change: "Service change",
  delays: "Delays",
  suspended: "Suspended",
};

export interface LineAlert {
  headline: string;
  detail?: string;
  state: LineState;
}

/** The service picture for one line (a subway line, or any line an operator reports on). */
export interface LineStatus {
  /** Public name, e.g. "A", "7", "SIR". */
  route: string;
  color: string;
  textColor: string;
  state: LineState;
  alerts: LineAlert[];
}
