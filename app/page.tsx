
import { LocalizedNumber } from "@/components/layout/LocalizedNumber";

import { Text } from "@/components/i18n/LanguageProvider";
import { getTranslator } from "@/lib/i18n/server";
import Link from "next/link";
import { GuideCard } from "@/components/guides/GuideCard";
import { EmberBackdrop, SiteFooter, SiteHeader } from "@/components/layout/SiteChrome";
import { site } from "@/config/site";
import { getAllGuides } from "@/lib/content/guides";

export default async function Home() {
  const t = await getTranslator();
  const guides = await getAllGuides(site.activeAlliance);
  return <main className="public-page">
    <EmberBackdrop />
    <SiteHeader />
    <section className="home-hero">
      <div className="hero-copy">
        <span className="signal-kicker"><i /> {" "}<Text>{"Survivor network online"}</Text></span>
        <h1><Text>{"Outlast the plague."}</Text><br /><em><Text>{"Build the alliance."}</Text></em></h1>
        <p><Text>{"Your command center for battle-tested guides, hero intelligence, live updates, and alliance communities across Last Asylum: Plague."}</Text></p>
        <div className="hero-actions"><Link href="/chat" className="primary-action"><Text>{"Join the community"}</Text>{" "}<span>→</span></Link><Link href="/guides" className="secondary-action"><Text>{"Explore field guides"}</Text></Link></div>
        <div className="hero-stats"><span><strong>{<LocalizedNumber value={guides.length} />}</strong><small><Text>{"Field guides"}</Text></small></span><span><strong>24/7</strong><small><Text>{"Alliance chat"}</Text></small></span><span><strong>#324</strong><small><Text>{"Home kingdom"}</Text></small></span></div>
      </div>
      <div className="hero-visual">
        <div className="mascot-halo" /><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        <img src="/images/burnfire/logo.png" alt={t("BurnFire Alliance mascot")} />
        <div className="floating-card floating-card-one"><span>🔥</span><div><small><Text>{"Alliance host"}</Text></small><strong><Text>{"BurnFire"}</Text></strong></div></div>
        <div className="floating-card floating-card-two"><span>✦</span><div><small><Text>{"Kingdom"}</Text></small><strong>#324</strong></div></div>
      </div>
    </section>

    <section className="portal-grid">
      <Link href="/guides" className="portal-card portal-guides"><span className="portal-number">01</span><i>⌁</i><h2><Text>{"Field guides"}</Text></h2><p><Text>{"Strategies written and tested by experienced survivors."}</Text></p><b><Text>{"Browse intelligence →"}</Text></b></Link>
      <Link href="/heroes" className="portal-card portal-heroes"><span className="portal-number">02</span><i>♟</i><h2><Text>{"Hero archive"}</Text></h2><p><Text>{"Skills, lineups, counters, and tier intelligence in one place."}</Text></p><b><Text>{"Meet the heroes →"}</Text></b></Link>
      <Link href="/updates" className="portal-card portal-updates"><span className="portal-number">03</span><i>⚡</i><h2><Text>{"Live intel"}</Text></h2><p><Text>{"Patch updates, event alerts, and known bug reports."}</Text></p><b><Text>{"Read the latest →"}</Text></b></Link>
      <Link href="/chat" className="portal-card portal-community"><span className="portal-number">04</span><i>◉</i><h2><Text>{"Alliance network"}</Text></h2><p><Text>{"Private alliance spaces and a shared worldwide community."}</Text></p><b><Text>{"Enter the network →"}</Text></b></Link>
    </section>

    <section className="featured-section">
      <div className="section-heading"><div><span className="eyebrow"><Text>{"Fresh from the front"}</Text></span><h2><Text>{"Latest field intelligence"}</Text></h2></div><Link href="/guides"><Text>{"View all guides →"}</Text></Link></div>
      <div className="featured-guides">{guides.slice(0, 3).map((guide, index) => <GuideCard key={guide.slug} guide={guide} index={index + 1} />)}</div>
    </section>

    <section className="community-banner"><div><span className="eyebrow"><Text>{"More than a website"}</Text></span><h2><Text>{"Your alliance deserves its own fire."}</Text></h2><p><Text>{"Join the shared community, then create a private home for your alliance—with trusted ranks, channels, and identities that update everywhere."}</Text></p></div><Link href="/chat" className="primary-action"><Text>{"Claim your place"}</Text>{" "}<span>→</span></Link></section>
    <SiteFooter />
  </main>;
}
