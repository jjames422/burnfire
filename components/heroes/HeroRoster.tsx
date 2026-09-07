"use client";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Hero, HeroFaction, HeroRole } from "@/lib/content/heroes";
type Filter = "All" | HeroFaction | HeroRole;
const filters: Filter[] = ["All", "Warrior", "Ranger", "Warlock", "Tank", "Carry", "Support"];
export function HeroRoster({ heroes }: { heroes: Hero[] }) {
  const [filter, setFilter] = useState<Filter>("All");
  const visible = useMemo(() => filter === "All" ? heroes : heroes.filter((hero) => hero.faction === filter || hero.role === filter), [filter, heroes]);
  return <div><div className="hero-filters" aria-label="Filter heroes">{filters.map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="hero-roster">{visible.map((hero) => <Link className={`hero-card faction-${hero.faction.toLowerCase()}`} href={`/heroes/${hero.slug}`} key={hero.slug}><div className="hero-card-art"><Image src={hero.image} alt={`${hero.name}, ${hero.faction} ${hero.role}`} fill sizes="(min-width: 1100px) 25vw, (min-width: 650px) 50vw, 100vw" /></div><div className="hero-card-copy"><div className="hero-badges"><span>{hero.rarity}</span><b>{hero.faction}</b><b>{hero.role}</b></div><h2>{hero.name}</h2><p>{hero.summary}</p><strong>Open dossier <i>↗</i></strong></div></Link>)}</div></div>;
}
