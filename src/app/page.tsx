import { redirect } from "next/navigation";
import { ModelHome } from "@/components/home/model-home";
import { toLink } from "@/domain/board";
import { NORTHEAST } from "@/domain/region";
import { boardsIn } from "@/lib/boards";
import { listBoards } from "@/providers/registry";

/**
 * Entry point. With a single board there is nothing to choose, so go straight
 * to it: "where's my train" stays one step away. With several, the home page is a live
 * model of everything moving, with search on top and the boards listed below it.
 */
export default function Home() {
  const links = listBoards().map(toLink);
  if (links.length === 1) redirect(links[0]!.href);

  // The page carries only the boards of where the map opens; the rest are asked for as the map moves (/api/boards).
  const modes = [...new Set(links.map((b) => b.mode))];
  return <ModelHome initialBoards={boardsIn(links, NORTHEAST.bounds)} modes={modes} />;
}
