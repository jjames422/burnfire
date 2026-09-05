import { burnfire } from "./burnfire";

export interface AllianceTheme {
  colorBg: string;
  colorSurface: string;
  colorSurfaceRaised: string;
  colorBorder: string;
  colorTextPrimary: string;
  colorTextSecondary: string;
  colorAccent: string;
  colorAccentBright: string;
  colorToxic: string;
  colorTip: string;
  colorWarning: string;
  colorLore: string;
}

export interface Alliance {
  slug: string;
  name: string;
  tagline: string;
  gameName: string;
  /** Canonical domain, no protocol — single source of truth for canonical URLs/OG tags. */
  domain: string;
  logo: string;
  theme: AllianceTheme;
}

export const alliances = {
  burnfire,
} satisfies Record<string, Alliance>;

export type AllianceSlug = keyof typeof alliances;

export function getAlliance(slug: AllianceSlug): Alliance {
  return alliances[slug];
}
