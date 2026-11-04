"use client";
import { useTranslation } from "@/components/i18n/LanguageProvider";

/** Shown in place of hero artwork until an image is added under public/images/heroes/. */
export function HeroArtPlaceholder({ name, size }: { name: string; size: "small" | "medium" | "large" }) {
  const { t } = useTranslation();
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className={`hero-art-placeholder hero-art-placeholder-${size}`} role="img" aria-label={t("{name} — artwork coming soon", { name })}>
      <span>{initials}</span>
    </span>
  );
}
