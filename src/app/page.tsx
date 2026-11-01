import { redirect } from "next/navigation";
import { ModelHome } from "@/components/home/model-home";
import { toLink } from "@/domain/board";
import { listBoards } from "@/providers/registry";

/**
 * Entry point. With a single board there is nothing to choose, so go straight
 * to it: "where's my train" stays one step away. With several, the home page is a live
 * model of everything moving, with search on top and the boards listed below it.
 */
export default function Home() {
  const boards = listBoards();
  const links = boards.map(toLink);
  if (links.length === 1) redirect(links[0]!.href);

  return <ModelHome boards={links} />;
}
