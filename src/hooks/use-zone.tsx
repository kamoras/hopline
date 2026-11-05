"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { BoardLink } from "@/domain/board";
import { getRegion, NORTHEAST, type Region } from "@/domain/region";

const Boards = createContext<readonly BoardLink[]>([]);

/** Makes the boards the page knows about available to anything that has to show a time in a board's own zone. */
export const BoardZones = ({
  boards,
  children,
}: {
  boards: readonly BoardLink[];
  children: ReactNode;
}) => <Boards value={boards}>{children}</Boards>;

/** The time zone of a board's region: from the boards loaded, else a hand-written region, else the Northeast's. */
export function useZoneOf(): (regionId: string) => Pick<Region, "timeZone"> {
  const boards = useContext(Boards);
  return (regionId) => ({
    timeZone:
      boards.find((b) => b.regionId === regionId)?.timeZone ??
      getRegion(regionId)?.timeZone ??
      NORTHEAST.timeZone,
  });
}

export const useZone = (regionId: string) => useZoneOf()(regionId);
