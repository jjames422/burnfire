"use client";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";


import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { site } from "@/config/site";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";
import "./portal.css";

const links = [
  { href: "/portal", label: "Your headquarters", mark: "01" },
  { href: "/academy", label: "Academy", mark: "02" },
  { href: "/chat", label: "Alliance chat", mark: "03" },
  { href: "/academy/announcements", label: "Announcements", mark: "04" },
  { href: "/command", label: "Command Center", mark: "05" },
  { href: "/portal/members", label: "Members & oversight", mark: "06" },
  { href: "/portal/security", label: "Sign-in & security", mark: "07" },
];

export function PortalShell({ children }: { children: ReactNode }) {
  const { t, locale } = useTranslation();
  const pathname = usePathname();
  return (
    <div className="portal-shell">
      <a href="#portal-content" className="portal-skip"><Text>{"Skip to content"}</Text></a>
      <aside className="portal-sidebar">
        <Link href="/portal" className="portal-brand">
          <img src="/images/burnfire/logo.png" alt="" />
          <span><small><Text>{"BURNFIRE ALLIANCE"}</Text></small><strong><Text>{"THE PORTAL"}</Text><span>.</span></strong></span>
        </Link>
        <div className="portal-sidebar-label"><Text>{"YOUR ALLIANCE. ONE CONNECTION."}</Text></div>
        <nav aria-label={t("Member portal")}>
          {links.map(({ href, label, mark }) => (
            <Link key={href} href={href} className={pathname === href ? "is-current" : ""} aria-current={pathname === href ? "page" : undefined}>
              <span>{mark}</span>{t(label)}
            </Link>
          ))}
        </nav>
        <div className="portal-sidebar-bottom">
          <span className="portal-signal"><i /> {" "}<Text>{"KINGDOM #324"}</Text></span>
          <p><Text>{"Learn together."}</Text><br /><Text>{"Stand stronger."}</Text></p>
          <a href={`https://${site.alliance.domain}/guides`}><Text>{"Explore public guides →"}</Text></a>
        </div>
      </aside>
      <div className="portal-body">
        <header className="portal-topbar">
          <LanguageSelector />
          <span><Text>{"BF2"}</Text>{" "}<span className="portal-divider">/</span> {" "}<Text>{"MEMBER NETWORK"}</Text></span>
          <Link href="/portal/security"><Text>{"Your account →"}</Text></Link>
        </header>
        <main id="portal-content" className="portal-content">{children}</main>
        <footer className="portal-footer"><span><Text>{"BURNFIRE · KINGDOM #324"}</Text></span><span><Text>{"Built for the alliance. Powered by its people."}</Text></span></footer>
      </div>
    </div>
  );
}
