"use client";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { HeroArtPlaceholder } from "@/components/heroes/HeroArtPlaceholder";
import type { Hero, HeroFaction, HeroRarity, HeroRole } from "@/lib/content/heroes";
type Filter = "All" | HeroRarity | HeroFaction | HeroRole;
const filters: Filter[] = ["All", "UR", "SSR", "SR", "Warrior", "Ranger", "Warlock", "Tank", "Carry", "Support"];
export function HeroRoster({ heroes }: { heroes: Hero[] }) {
  const { t, locale } = useTranslation();
  const [filter, setFilter] = useState<Filter>("All");
  const visible = useMemo(() => filter === "All" ? heroes : heroes.filter((hero) => hero.rarity === filter || hero.faction === filter || hero.role === filter), [filter, heroes]);
  return <div><div className="hero-filters" aria-label={t("Filter heroes")}>{filters.map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{t(item)}</button>)}</div><div className="hero-roster">{visible.map((hero) => <Link className={`hero-card faction-${hero.faction.toLowerCase()}`} href={`/heroes/${hero.slug}`} key={hero.slug}><div className="hero-card-art">{hero.image ? <Image src={hero.image} alt={t("{name}, {faction} {role}", { name: hero.name, faction: t(hero.faction), role: t(hero.role) })} fill sizes="(min-width: 1100px) 25vw, (min-width: 650px) 50vw, 100vw" /> : <HeroArtPlaceholder name={hero.name} size="medium" />}</div><div className="hero-card-copy"><div className="hero-badges"><span>{hero.rarity}</span><b>{t(hero.faction)}</b><b>{t(hero.role)}</b></div><h2>{hero.name}</h2><p>{hero.summary}</p><strong><Text>{"Open dossier"}</Text>{" "}<i>↗</i></strong></div></Link>)}</div></div>;
}
