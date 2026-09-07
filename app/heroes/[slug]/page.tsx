import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmberBackdrop, SiteFooter, SiteHeader } from "@/components/layout/SiteChrome";
import { getHero, heroes, heroStats } from "@/lib/content/heroes";
export function generateStaticParams() { return heroes.map(({ slug }) => ({ slug })); }
export default async function HeroPage({ params }: PageProps<"/heroes/[slug]">) {
  const { slug } = await params; const hero = getHero(slug); if (!hero) notFound();
  const stats = [["ATK", heroStats.attack], ["HP", heroStats.hp], ["DEF", heroStats.defense], ["CMD", heroStats.command]];
  return <main className="public-page"><EmberBackdrop /><SiteHeader active="heroes" /><article className={`hero-dossier faction-${hero.faction.toLowerCase()}`}><Link className="hero-back" href="/heroes">← All heroes</Link><div className="hero-profile-grid"><div className="hero-profile-art"><div className="hero-profile-halo" /><Image src={hero.image} alt={`${hero.name} full hero artwork`} fill priority sizes="(min-width: 900px) 48vw, 100vw" /></div><div className="hero-profile-copy"><span className="signal-kicker"><i /> Hero dossier · {hero.rarity}</span><h1>{hero.name}</h1><div className="hero-badges"><b>{hero.faction}</b><b>{hero.role}</b></div><p className="hero-profile-summary">{hero.summary}</p><div className="hero-stat-grid">{stats.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div><section className="hero-intel-panel"><small>Acquisition intelligence</small><p>{hero.unlock}</p></section><section className="hero-intel-panel"><small>Skill archive</small><ol>{hero.skills.map((skill, index) => <li key={skill}><span>{String(index + 1).padStart(2, "0")}</span>{skill}</li>)}</ol></section><p className="hero-source-note">Game values and availability can change with server age and updates. Confirm current details in game before spending.</p></div></div></article><SiteFooter /></main>;
}
