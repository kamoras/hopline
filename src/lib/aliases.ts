import { REGIONS } from "@/domain/region";
import type { Aliases } from "./query";

/** What people call places, across every region ("new york" is Grand Central and Penn Station), for searches that span boards. */
export const aliasesOfAll = (): Aliases => Object.assign({}, ...REGIONS.map((r) => r.aliases ?? {}));
