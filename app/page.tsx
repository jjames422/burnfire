import Link from "next/link";
import { GuideCard } from "@/components/guides/GuideCard";
import { EmberBackdrop, SiteFooter, SiteHeader } from "@/components/layout/SiteChrome";
import { site } from "@/config/site";
import { getAllGuides } from "@/lib/content/guides";

export default async function Home() {
  const guides = await getAllGuides(site.activeAlliance);
  return <main className="public-page">
    <EmberBackdrop />
    <SiteHeader />
    <section className="home-hero">
      <div className="hero-copy">
        <span className="signal-kicker"><i /> Survivor network online</span>
        <h1>Outlast the plague.<br /><em>Build the alliance.</em></h1>
        <p>Your command center for battle-tested guides, hero intelligence, live updates, and alliance communities across Last Asylum: Plague.</p>
        <div className="hero-actions"><Link href="/chat" className="primary-action">Join the community <span>→</span></Link><Link href="/guides" className="secondary-action">Explore field guides</Link></div>
        <div className="hero-stats"><span><strong>{guides.length}</strong><small>Field guides</small></span><span><strong>24/7</strong><small>Alliance chat</small></span><span><strong>#324</strong><small>Home kingdom</small></span></div>
      </div>
      <div className="hero-visual">
        <div className="mascot-halo" /><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        <img src="/images/burnfire/logo.png" alt="BurnFire Alliance mascot" />
        <div className="floating-card floating-card-one"><span>🔥</span><div><small>Alliance host</small><strong>BurnFire</strong></div></div>
        <div className="floating-card floating-card-two"><span>✦</span><div><small>Kingdom</small><strong>#324</strong></div></div>
      </div>
    </section>

    <section className="portal-grid">
      <Link href="/guides" className="portal-card portal-guides"><span className="portal-number">01</span><i>⌁</i><h2>Field guides</h2><p>Strategies written and tested by experienced survivors.</p><b>Browse intelligence →</b></Link>
      <Link href="/heroes" className="portal-card portal-heroes"><span className="portal-number">02</span><i>♟</i><h2>Hero archive</h2><p>Skills, lineups, counters, and tier intelligence in one place.</p><b>Meet the heroes →</b></Link>
      <Link href="/updates" className="portal-card portal-updates"><span className="portal-number">03</span><i>⚡</i><h2>Live intel</h2><p>Patch updates, event alerts, and known bug reports.</p><b>Read the latest →</b></Link>
      <Link href="/chat" className="portal-card portal-community"><span className="portal-number">04</span><i>◉</i><h2>Alliance network</h2><p>Private alliance spaces and a shared worldwide community.</p><b>Enter the network →</b></Link>
    </section>

    <section className="featured-section">
      <div className="section-heading"><div><span className="eyebrow">Fresh from the front</span><h2>Latest field intelligence</h2></div><Link href="/guides">View all guides →</Link></div>
      <div className="featured-guides">{guides.slice(0, 3).map((guide, index) => <GuideCard key={guide.slug} guide={guide} index={index + 1} />)}</div>
    </section>

    <section className="community-banner"><div><span className="eyebrow">More than a website</span><h2>Your alliance deserves its own fire.</h2><p>Join the shared community, then create a private home for your alliance—with trusted ranks, channels, and identities that update everywhere.</p></div><Link href="/chat" className="primary-action">Claim your place <span>→</span></Link></section>
    <SiteFooter />
  </main>;
}
