import Link from "next/link";
import { BRAND } from "@/brand";
import { MarkSvg } from "./mark";

/** Mark + wordmark, linking home. The wordmark is live text so it inherits the theme. */
export function Logo({ size = 32, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  return (
    <Link href="/" aria-label={`${BRAND.name} home`} className="inline-flex items-center gap-2.5 rounded-lg">
      <span className="overflow-hidden rounded-[9px] ring-1 ring-black/5 dark:ring-white/10">
        <MarkSvg size={size} rounded={false} />
      </span>
      {showWordmark && <span className="text-[1.15rem] font-bold tracking-[-0.03em]">{BRAND.name}</span>}
    </Link>
  );
}
