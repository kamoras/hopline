"use client";

import { useCallback, useEffect, useState } from "react";
import { parseFocus, placeHref, tripHref, type Focus } from "@/domain/board";

/**
 * What the board is focused on (a trip or a station), mirrored into the URL so
 * every view is a shareable deep link and Back closes the sheet. Uses the
 * History API directly: no navigation, no refetch, instant.
 */
export function useFocus(baseHref: string, initial: Focus) {
  const [focus, setFocus] = useState<Focus>(initial);

  useEffect(() => {
    const onPop = () => {
      const rest = window.location.pathname.slice(baseHref.length).split("/").filter(Boolean);
      setFocus(parseFocus(rest) ?? {});
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [baseHref]);

  const go = useCallback((next: Focus, href: string) => {
    setFocus(next);
    window.history.pushState(null, "", href);
  }, []);

  return {
    focus,
    openTrip: useCallback((key: string) => go({ tripKey: key }, tripHref(baseHref, key)), [go, baseHref]),
    openPlace: useCallback((id: string) => go({ placeId: id }, placeHref(baseHref, id)), [go, baseHref]),
    close: useCallback(() => go({}, baseHref), [go, baseHref]),
  };
}
