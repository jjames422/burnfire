"use client";

import { useMemo, useState } from "react";
import type { GuideFrontmatter, GuideTag } from "@/lib/content/types";
import { getAvailableTags } from "@/lib/content/tags";
import { GuideCard } from "./GuideCard";
import { TagChip } from "./TagChip";

interface GuideIndexProps {
  guides: GuideFrontmatter[];
}

/**
 * Client-side tag filter — the full guide list is passed in as a prop and
 * filtered with local state, no server query-param handling needed at this
 * content scale (a few dozen guides at most).
 */
export function GuideIndex({ guides }: GuideIndexProps) {
  const [activeTag, setActiveTag] = useState<GuideTag | null>(null);
  const availableTags = useMemo(() => getAvailableTags(guides), [guides]);
  const filtered = activeTag ? guides.filter((guide) => guide.tags.includes(activeTag)) : guides;

  return (
    <div>
      <div className="mb-8 flex flex-wrap gap-2">
        <TagChip label="All" active={activeTag === null} onClick={() => setActiveTag(null)} />
        {availableTags.map((tag) => (
          <TagChip key={tag} label={tag} active={activeTag === tag} onClick={() => setActiveTag(tag)} />
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-text-secondary">No guides tagged {activeTag} yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((guide) => (
            <GuideCard key={guide.slug} guide={guide} />
          ))}
        </div>
      )}
    </div>
  );
}
