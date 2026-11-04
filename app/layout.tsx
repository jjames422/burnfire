import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Oswald, IBM_Plex_Sans } from "next/font/google";
import { site } from "@/config/site";
import { LanguageProvider } from "@/components/i18n/LanguageProvider";
import { getLocale, getTranslator } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { direction } from "@/lib/i18n/locales";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return {
    title: {
      default: site.alliance.name,
      template: `%s · ${site.alliance.name}`,
    },
    description: t(site.alliance.tagline),
    metadataBase: new URL(`https://${site.alliance.domain}`),
  };
}

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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const dictionary = await getDictionary(locale);
  return (
    <html
      lang={locale}
      dir={direction(locale)}
      style={themeStyle}
      className={`${oswald.variable} ${plexSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg text-text-primary">
        <LanguageProvider locale={locale} dictionary={dictionary}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
