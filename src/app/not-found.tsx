import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { EmptyState } from "@/components/empty-state";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md space-y-8 px-4 py-12">
      <Logo />
      <EmptyState
        art="lost"
        title="We couldn't find that page"
        body="That page or board doesn't exist, or we don't cover it yet."
        action={
          <Link href="/" className="inline-block rounded-xl bg-brand px-5 py-2.5 font-semibold text-white press">
            Back to Hopline
          </Link>
        }
      />
    </main>
  );
}
