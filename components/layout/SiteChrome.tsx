
import { Text } from "@/components/i18n/LanguageProvider";
import { getTranslator } from "@/lib/i18n/server";
import Link from "next/link";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/server/auth";
import { ACCOUNT_HINT_COOKIE } from "@/lib/auth/account-hint";
import { logAuthFailure } from "@/lib/auth/logging";

export function EmberBackdrop() {
  return <><div className="ember-glow ember-glow-one" /><div className="ember-glow ember-glow-two" /><div className="ember-field" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} />)}</div></>;
}

export async function SiteHeader({ active }: { active?: string }) {
  const t = await getTranslator();
  const cookieStore = await cookies();
  let signedIn = false;
  let sessionError = false;
  try {
    signedIn = Boolean(await getSessionUser());
  } catch {
    logAuthFailure("SESSION_LOAD_FAILED");
    sessionError = true;
  }
  const showSignup = !signedIn && !sessionError && cookieStore.get(ACCOUNT_HINT_COOKIE)?.value !== "1";
  const links = [["Guides", "/guides"], ["Heroes", "/heroes"], ["Updates", "/updates"], ["Community", "/chat"]];
  return <header className="public-header">
    <Link href="/" className="brand-lockup"><img src="/images/burnfire/logo.png" alt="" /><span><small><Text>{"Last Asylum"}</Text></small><strong><Text>{"Plague"}</Text></strong></span></Link>
    <nav>{links.map(([label, href]) => <Link key={href} href={href} className={active === label.toLowerCase() ? "active" : ""}>{t(label)}</Link>)}</nav>
    <div className="header-tools">
      <LanguageSelector />
      <div className="header-account" role="group" aria-label={t("Member portal")}>
        <Link href="/portal" className="header-cta"><i aria-hidden="true" /><span>{signedIn ? <Text>{"Enter member portal"}</Text> : <><small><Text>{"Member portal"}</Text></small><strong><Text>{"Sign in"}</Text></strong></>}</span></Link>
        {showSignup && <Link href="/portal?signup=1" className="header-signup"><Text>{"Create account"}</Text></Link>}
      </div>
      {sessionError && <p className="header-session-error" role="status">{t("Your session could not be loaded. Please try again.")}</p>}
    </div>
  </header>;
}

export async function SiteFooter() {
  const t = await getTranslator();
  return <footer className="public-footer">
    <div className="footer-brand"><img src="/images/burnfire/logo.png" alt={t("BurnFire Alliance")} /><span><strong><Text>{"BurnFire Alliance"}</Text></strong><small><Text>{"Kingdom #324"}</Text></small></span></div>
    <p><Text>{"An unofficial community site for"}</Text>{" "}<strong><Text>{"Last Asylum: Plague"}</Text></strong><Text>{"—built by players, for survivors."}</Text></p>
    <nav><Link href="/guides"><Text>{"Guides"}</Text></Link><Link href="/heroes"><Text>{"Heroes"}</Text></Link><Link href="/updates"><Text>{"Updates"}</Text></Link><Link href="/bugs"><Text>{"Bug tracker"}</Text></Link><Link href="/fan-art"><Text>{"Fan art"}</Text></Link></nav>
  </footer>;
}
