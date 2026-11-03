/** Shown in place of hero artwork until an image is added under public/images/heroes/. */
export function HeroArtPlaceholder({ name, size }: { name: string; size: "small" | "medium" | "large" }) {
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className={`hero-art-placeholder hero-art-placeholder-${size}`} role="img" aria-label={`${name} — artwork coming soon`}>
      <span>{initials}</span>
    </span>
  );
}
