import type { Metadata } from "next";
import { GuideIndex } from "@/components/guides/GuideIndex";
import { EmberBackdrop, SiteFooter, SiteHeader } from "@/components/layout/SiteChrome";
import { site } from "@/config/site";
import { getAllGuides } from "@/lib/content/guides";

export const metadata: Metadata = { title: "Field Guides" };

export default async function GuidesPage() {
  const guides = await getAllGuides(site.activeAlliance);
  return <main className="public-page"><EmberBackdrop /><SiteHeader active="guides" />
    <header className="archive-hero"><span className="signal-kicker"><i /> BurnFire intelligence archive</span><h1>Field <em>guides</em></h1><p>Battle-tested knowledge for building, fighting, surviving, and leading in Last Asylum: Plague.</p><div className="archive-count"><strong>{String(guides.length).padStart(2, "0")}</strong><span>Published<br />briefings</span></div></header>
    <section className="archive-body"><GuideIndex guides={guides} /></section><SiteFooter />
  </main>;
}
