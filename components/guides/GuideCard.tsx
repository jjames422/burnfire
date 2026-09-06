import Link from "next/link";
import type { GuideFrontmatter } from "@/lib/content/types";
import { TagChip } from "./TagChip";

interface GuideCardProps {
  guide: GuideFrontmatter;
  index?: number;
}

export function GuideCard({ guide, index }: GuideCardProps) {
  return (
    <Link
      href={`/guides/${guide.slug}`}
      className="guide-card group"
    >
      {index && <span className="guide-index">0{index}</span>}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {guide.tags.map((tag) => (
          <TagChip key={tag} label={tag} />
        ))}
      </div>
      <h3>
        {guide.title}
      </h3>
      <p className="guide-summary">{guide.summary}</p>
      <p className="guide-meta">
        {guide.author}
        {guide.authorRank ? ` · ${guide.authorRank}` : ""} · {guide.publishedAt}
      </p>
      <span className="guide-arrow">↗</span>
    </Link>
  );
}
