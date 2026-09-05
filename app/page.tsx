import Link from "next/link";
import { site } from "@/config/site";
import { getAllGuides } from "@/lib/content/guides";
import { groupGuidesByTag } from "@/lib/content/tags";
import { GuideCard } from "@/components/guides/GuideCard";

const MOST_RECENT_COUNT = 3;

export default async function Home() {
  const guides = await getAllGuides(site.activeAlliance);
  const mostRecent = guides.slice(0, MOST_RECENT_COUNT);
  const tagGroups = groupGuidesByTag(guides);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <section className="border-b border-border pb-12">
        <p className="mb-3 font-display text-sm font-semibold tracking-widest text-accent uppercase">
          {site.alliance.gameName}
        </p>
        <h1 className="font-display text-4xl font-bold text-text-primary md:text-5xl">
          {site.alliance.name}
        </h1>
        <p className="mt-4 max-w-xl text-lg text-text-secondary">{site.alliance.tagline}</p>
        <Link
          href="/guides"
          className="interactive-lift mt-10 inline-flex items-center border border-accent bg-accent px-5 py-3 font-display font-semibold text-text-primary hover:border-accent-bright hover:bg-accent-bright"
        >
          Browse all guides
        </Link>
      </section>

      {mostRecent.length > 0 && (
        <section className="border-b border-border py-12">
          <h2 className="mb-6 font-display text-2xl font-semibold text-text-primary">
            Most recent
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mostRecent.map((guide) => (
              <GuideCard key={guide.slug} guide={guide} />
            ))}
          </div>
        </section>
      )}

      {tagGroups.map(({ tag, guides: tagGuides }) => (
        <section key={tag} className="border-b border-border py-12 last:border-b-0">
          <h2 className="mb-6 font-display text-2xl font-semibold text-text-primary">{tag}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tagGuides.map((guide) => (
              <GuideCard key={guide.slug} guide={guide} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
