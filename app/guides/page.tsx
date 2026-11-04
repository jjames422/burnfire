import { getTranslator } from "@/lib/i18n/server";

import { Text } from "@/components/i18n/LanguageProvider";
import type { Metadata } from "next";
import { GuideIndex } from "@/components/guides/GuideIndex";
import { EmberBackdrop, SiteFooter, SiteHeader } from "@/components/layout/SiteChrome";
import { site } from "@/config/site";
import { getAllGuides } from "@/lib/content/guides";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslator(); return { title: t("Field Guides") }; }

export default async function GuidesPage() {
  const guides = await getAllGuides(site.activeAlliance);
  return <main className="public-page"><EmberBackdrop /><SiteHeader active="guides" />
    <header className="archive-hero"><span className="signal-kicker"><i /> {" "}<Text>{"BurnFire intelligence archive"}</Text></span><h1><em><Text>{"Field guides"}</Text></em></h1><p><Text>{"Battle-tested knowledge for building, fighting, surviving, and leading in Last Asylum: Plague."}</Text></p><div className="archive-count"><strong>{String(guides.length).padStart(2, "0")}</strong><span><Text>{"Published"}</Text><br /><Text>{"briefings"}</Text></span></div></header>
    <section className="archive-body"><GuideIndex guides={guides} /></section><SiteFooter />
  </main>;
}
