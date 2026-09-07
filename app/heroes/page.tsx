import type { Metadata } from "next";
import { HeroRoster } from "@/components/heroes/HeroRoster";
import { EmberBackdrop, SiteFooter, SiteHeader } from "@/components/layout/SiteChrome";
import { heroes } from "@/lib/content/heroes";
export const metadata: Metadata = { title: "Hero Archive", description: "Last Asylum: Plague hero profiles, roles, factions, skills, and unlock information." };
export default function HeroesPage() { return <main className="public-page"><EmberBackdrop /><SiteHeader active="heroes" /><header className="archive-hero hero-archive-head"><span className="signal-kicker"><i /> BurnFire combat intelligence</span><h1>Hero <em>archive</em></h1><p>Build a stronger squad with verified hero roles, factions, unlock paths, and skill references. Choose a dossier to study the full profile.</p><div className="archive-count"><strong>{String(heroes.length).padStart(2, "0")}</strong><span>Verified<br />dossiers</span></div></header><section className="archive-body hero-archive-body"><HeroRoster heroes={heroes} /></section><SiteFooter /></main>; }
