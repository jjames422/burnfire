import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmberBackdrop, SiteFooter, SiteHeader } from "@/components/layout/SiteChrome";
import { HeroArtPlaceholder } from "@/components/heroes/HeroArtPlaceholder";
import { getHero, getMaxStats, getSkills, heroDataSource, heroes, type Hero } from "@/lib/content/heroes";

export function generateStaticParams() { return heroes.map(({ slug }) => ({ slug })); }

export default async function HeroPage({ params }: PageProps<"/heroes/[slug]">) {
  const { slug } = await params;
  const hero = getHero(slug);
  if (!hero) notFound();

  const maxStats = getMaxStats(hero);
  const stats = [["ATK", maxStats.attack], ["HP", maxStats.hp], ["DEF", maxStats.defense], ["CMD", maxStats.command]];
  const facts = [
    hero.power && ["Power at full build", hero.power],
    hero.attackInterval && ["Attack speed", `1 hit every ${hero.attackInterval}`],
    hero.exclusiveWeapon && ["Exclusive weapon", hero.exclusiveWeapon],
    hero.tierLists && ["Community tier lists", hero.tierLists],
  ].filter((fact): fact is string[] => Boolean(fact));
  const skills = getSkills(hero);
  const partners = hero.pairsWith.map(getHero).filter((partner): partner is Hero => partner !== undefined);

  return (
    <main className="public-page">
      <EmberBackdrop />
      <SiteHeader active="heroes" />
      <article className={`hero-dossier faction-${hero.faction.toLowerCase()}`}>
        <Link className="hero-back" href="/heroes">← All heroes</Link>
        <div className="hero-profile-grid">
          <div className="hero-profile-art">
            <div className="hero-profile-halo" />
            {hero.image
              ? <Image src={hero.image} alt={`${hero.name} full hero artwork`} fill priority sizes="(min-width: 900px) 48vw, 100vw" />
              : <HeroArtPlaceholder name={hero.name} size="large" />}
          </div>
          <div className="hero-profile-copy">
            <span className="signal-kicker"><i /> Hero dossier · {hero.rarity}</span>
            <h1>{hero.name}</h1>
            <div className="hero-badges"><span>{hero.tier ?? hero.rarity}</span><b>{hero.faction}</b><b>{hero.role}</b></div>
            <p className="hero-profile-summary">{hero.summary}</p>
            {stats.length > 0 && (
              <>
                <div className="hero-stat-grid">
                  {stats.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}
                </div>
                <p className="hero-stat-note">Hero stats at Lv150 · 10★, before gear, weapon, awakening and buildings</p>
              </>
            )}
            {facts.length > 0 && (
              <dl className="hero-fact-list">
                {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
              </dl>
            )}
            <section className="hero-intel-panel"><small>How to get {hero.name}</small><p>{hero.unlock}</p></section>
            <section className="hero-intel-panel"><small>Star investment</small><p>{hero.investment}</p></section>
          </div>
        </div>

        <div className="hero-workup">
          <section className="hero-workup-overview">
            <span className="signal-kicker"><i /> Field report</span>
            <h2>Playing {hero.name}</h2>
            {hero.overview.map((paragraph) => <p key={paragraph.slice(0, 32)}>{paragraph}</p>)}
          </section>

          <section className="hero-skill-section">
            <span className="signal-kicker"><i /> Skill archive</span>
            <h2>Skills</h2>
            {hero.skillPriority && hero.skillPriority.length > 0 && (
              <p className="hero-skill-priority"><strong>Skill Badge priority:</strong> {hero.skillPriority.join(" → ")}</p>
            )}
            <ol className="hero-skill-list">
              {skills.map((skill, index) => (
                <li key={skill.name} className="hero-skill">
                  <div className="hero-skill-head">
                    <span className="hero-skill-index">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <small>{skill.kind}{skill.cooldown ? ` · ${skill.cooldown} CD` : ""}{skill.unlock ? ` · ${skill.unlock}` : ""}</small>
                      <h3>{skill.name}</h3>
                    </div>
                  </div>
                  <p>{skill.effect}{skill.starUpgrades ? ` (skill Lv1 → Lv${hero.rarity === "SR" ? 30 : 40})` : ""}</p>
                  {skill.starUpgrades && (
                    <ul className="hero-skill-upgrades">
                      {skill.starUpgrades.map((upgrade) => <li key={upgrade}>{upgrade}</li>)}
                    </ul>
                  )}
                  {skill.maxStars && <p className="hero-skill-max">{skill.maxStars}</p>}
                </li>
              ))}
            </ol>
          </section>

          <section className="hero-squad-section">
            <span className="signal-kicker"><i /> Squad fit</span>
            <h2>Where {hero.name} belongs</h2>
            <p>{hero.squadFit}</p>
            {partners.length > 0 && (
              <div className="hero-partners">
                <small>Pairs well with</small>
                <ul>
                  {partners.map((partner) => (
                    <li key={partner.slug}>
                      <Link className={`hero-partner faction-${partner.faction.toLowerCase()}`} href={`/heroes/${partner.slug}`}>
                        <span className="hero-partner-art">{partner.image ? <Image src={partner.image} alt="" fill sizes="56px" /> : <HeroArtPlaceholder name={partner.name} size="small" />}</span>
                        <span><strong>{partner.name}</strong><small>{partner.faction} · {partner.role}</small></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <p className="hero-source-note">Stats, skill values and unlock days from the <a href={heroDataSource.url} target="_blank" rel="noopener noreferrer">{heroDataSource.name}</a>, checked {heroDataSource.checked}. Values can shift with balance patches, and availability changes with server age. Confirm current details in game before spending.</p>
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}
