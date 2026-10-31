import { BRAND } from "@/brand";

/**
 * The Hopline mark: a "hop" arcing between two stops on a line.
 * Pure SVG with no hooks or classes so it also renders in icon and social-image routes.
 */
export function MarkSvg({ size = 32, rounded = true }: { size?: number; rounded?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="32" height="32" rx={rounded ? 8 : 0} fill={BRAND.navy} />
      <path d="M9 21.5C11 9 21 9 23 21.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="9" cy="21.5" r="3.1" fill="#fff" />
      <circle cx="23" cy="21.5" r="3.1" fill={BRAND.light} />
    </svg>
  );
}
