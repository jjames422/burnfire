import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Oswald, IBM_Plex_Sans } from "next/font/google";
import { site } from "@/config/site";
import "./globals.css";

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: site.alliance.name,
    template: `%s · ${site.alliance.name}`,
  },
  description: site.alliance.tagline,
  metadataBase: new URL(`https://${site.alliance.domain}`),
};

const theme = site.alliance.theme;

/**
 * The whole alliance look flows through these custom properties, set once
 * here from config/alliances/*.ts. Swapping the active alliance in
 * config/site.ts swaps every color on the site with zero component edits.
 */
const themeStyle = {
  "--bg": theme.colorBg,
  "--surface": theme.colorSurface,
  "--surface-raised": theme.colorSurfaceRaised,
  "--border": theme.colorBorder,
  "--text-primary": theme.colorTextPrimary,
  "--text-secondary": theme.colorTextSecondary,
  "--accent": theme.colorAccent,
  "--accent-bright": theme.colorAccentBright,
  "--toxic": theme.colorToxic,
  "--tip": theme.colorTip,
  "--warning": theme.colorWarning,
  "--lore": theme.colorLore,
} as CSSProperties;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      style={themeStyle}
      className={`${oswald.variable} ${plexSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg text-text-primary">{children}</body>
    </html>
  );
}
