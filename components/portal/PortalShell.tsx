"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { site } from "@/config/site";
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
  const pathname = usePathname();
  return (
    <div className="portal-shell">
      <a href="#portal-content" className="portal-skip">Skip to content</a>
      <aside className="portal-sidebar">
        <Link href="/portal" className="portal-brand">
          <img src="/images/burnfire/logo.png" alt="" />
          <span><small>BURNFIRE ALLIANCE</small><strong>THE PORTAL<span>.</span></strong></span>
        </Link>
        <div className="portal-sidebar-label">YOUR ALLIANCE. ONE CONNECTION.</div>
        <nav aria-label="Member portal">
          {links.map(({ href, label, mark }) => (
            <Link key={href} href={href} className={pathname === href ? "is-current" : ""} aria-current={pathname === href ? "page" : undefined}>
              <span>{mark}</span>{label}
            </Link>
          ))}
        </nav>
        <div className="portal-sidebar-bottom">
          <span className="portal-signal"><i /> KINGDOM #324</span>
          <p>Learn together.<br />Stand stronger.</p>
          <a href={`https://${site.alliance.domain}/guides`}>Explore public guides &rarr;</a>
        </div>
      </aside>
      <div className="portal-body">
        <header className="portal-topbar">
          <span>BF2 <span className="portal-divider">/</span> MEMBER NETWORK</span>
          <Link href="/portal/security">Your account &rarr;</Link>
        </header>
        <main id="portal-content" className="portal-content">{children}</main>
        <footer className="portal-footer"><span>BURNFIRE · KINGDOM #324</span><span>Built for the alliance. Powered by its people.</span></footer>
      </div>
    </div>
  );
}
