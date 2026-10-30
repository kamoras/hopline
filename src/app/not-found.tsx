import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">Nothing here</h1>
      <p className="mt-2 text-muted">We don&apos;t cover that mode or area yet.</p>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-accent px-4 py-2 font-semibold text-white">
        Choose a board
      </Link>
    </main>
  );
}
