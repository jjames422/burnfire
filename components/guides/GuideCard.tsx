import Link from "next/link";
import type { GuideFrontmatter } from "@/lib/content/types";
import { TagChip } from "./TagChip";

interface GuideCardProps {
  guide: GuideFrontmatter;
}

export function GuideCard({ guide }: GuideCardProps) {
  return (
    <Link
      href={`/guides/${guide.slug}`}
      className="interactive-lift group flex h-full flex-col border border-border bg-surface p-5 hover:border-accent-bright"
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {guide.tags.map((tag) => (
          <TagChip key={tag} label={tag} />
        ))}
      </div>
      <h3 className="font-display text-lg font-semibold text-text-primary group-hover:text-accent-bright">
        {guide.title}
      </h3>
      <p className="mt-2 flex-1 text-sm text-text-secondary">{guide.summary}</p>
      <p className="mt-4 text-xs text-text-secondary">
        {guide.author}
        {guide.authorRank ? ` · ${guide.authorRank}` : ""} · {guide.publishedAt}
      </p>
    </Link>
  );
}
