import type { Metadata } from "next";
import { getAllGuides } from "@/lib/content/guides";
import { site } from "@/config/site";
import { GuideIndex } from "@/components/guides/GuideIndex";

export const metadata: Metadata = {
  title: "Guides",
};

export default async function GuidesPage() {
  const guides = await getAllGuides(site.activeAlliance);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="font-display text-3xl font-bold text-text-primary md:text-4xl">All guides</h1>
      <p className="mt-2 mb-10 text-text-secondary">
        Every {site.alliance.name} guide, filterable by tag.
      </p>
      <GuideIndex guides={guides} />
    </main>
  );
}
