import { redirect } from "next/navigation";
import { BoardChooser } from "@/components/home/board-chooser";
import { toLink } from "@/domain/board";
import { listBoards } from "@/providers/registry";

/**
 * Entry point. With a single board there is nothing to choose, so go straight
 * to it: "where's my train" stays one step away. With several, show the chooser
 * (search, resume, map).
 */
export default function Home() {
  const boards = listBoards();
  const links = boards.map(toLink);
  if (links.length === 1) redirect(links[0]!.href);

  const pins = boards.map((b, i) => ({
    mode: b.mode,
    name: b.region.name,
    href: links[i]!.href,
    lon: b.region.center[0],
    lat: b.region.center[1],
  }));
  return <BoardChooser boards={links} pins={pins} />;
}
