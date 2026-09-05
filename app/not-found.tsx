import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center px-6 py-24">
      <p className="mb-3 font-display text-sm font-semibold tracking-widest text-accent uppercase">
        404
      </p>
      <h1 className="font-display text-3xl font-bold text-text-primary">Page not found</h1>
      <p className="mt-4 text-text-secondary">
        That page doesn&apos;t exist, or hasn&apos;t been written yet.
      </p>
      <Link
        href="/"
        className="interactive-lift mt-8 inline-flex items-center border border-border px-5 py-3 font-display font-semibold text-text-primary hover:border-accent-bright hover:text-accent-bright"
      >
        Back home
      </Link>
    </main>
  );
}
