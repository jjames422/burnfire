import Link from "next/link";

export function EmberBackdrop() {
  return <><div className="ember-glow ember-glow-one" /><div className="ember-glow ember-glow-two" /><div className="ember-field" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} />)}</div></>;
}

export function SiteHeader({ active }: { active?: string }) {
  const links = [["Guides", "/guides"], ["Heroes", "/heroes"], ["Updates", "/updates"], ["Community", "/chat"]];
  return <header className="public-header">
    <Link href="/" className="brand-lockup"><img src="/images/burnfire/logo.png" alt="" /><span><small>Last Asylum</small><strong>Plague</strong></span></Link>
    <nav>{links.map(([label, href]) => <Link key={href} href={href} className={active === label.toLowerCase() ? "active" : ""}>{label}</Link>)}</nav>
    <Link href="/chat" className="header-cta"><i /> Enter community</Link>
  </header>;
}

export function SiteFooter() {
  return <footer className="public-footer">
    <div className="footer-brand"><img src="/images/burnfire/logo.png" alt="BurnFire Alliance" /><span><strong>BurnFire Alliance</strong><small>Kingdom #324</small></span></div>
    <p>An unofficial community site for <strong>Last Asylum: Plague</strong>—built by players, for survivors.</p>
    <nav><Link href="/guides">Guides</Link><Link href="/heroes">Heroes</Link><Link href="/updates">Updates</Link><Link href="/bugs">Bug tracker</Link><Link href="/fan-art">Fan art</Link></nav>
  </footer>;
}
