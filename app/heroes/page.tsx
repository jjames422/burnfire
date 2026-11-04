import { getTranslator } from "@/lib/i18n/server";

import { Text } from "@/components/i18n/LanguageProvider";
import type { Metadata } from "next";
import { HeroRoster } from "@/components/heroes/HeroRoster";
import { EmberBackdrop, SiteFooter, SiteHeader } from "@/components/layout/SiteChrome";
import { getLocalizedHeroes } from "@/lib/content/heroes";
export async function generateMetadata(): Promise<Metadata> { const t = await getTranslator(); return { title: t("Hero Archive"), description: t("Last Asylum: Plague hero profiles, roles, factions, skills, and unlock information.") }; }
export default async function HeroesPage() { const heroes = await getLocalizedHeroes(); return <main className="public-page"><EmberBackdrop /><SiteHeader active="heroes" /><header className="archive-hero hero-archive-head"><span className="signal-kicker"><i /> {" "}<Text>{"BurnFire combat intelligence"}</Text></span><h1><em><Text>{"Hero archive"}</Text></em></h1><p><Text>{"Build a stronger squad with verified hero roles, factions, unlock paths, and skill references. Choose a dossier to study the full profile."}</Text></p><div className="archive-count"><strong>{String(heroes.length).padStart(2, "0")}</strong><span><Text>{"Verified"}</Text><br /><Text>{"dossiers"}</Text></span></div></header><section className="archive-body hero-archive-body"><HeroRoster heroes={heroes} /></section><SiteFooter /></main>; }
