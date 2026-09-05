import { GUIDE_TAGS, type GuideFrontmatter, type GuideTag } from "./types";

export interface TagGroup {
  tag: GuideTag;
  guides: GuideFrontmatter[];
}

/** Groups guides by tag, in the fixed GUIDE_TAGS order, dropping tags with no guides. */
export function groupGuidesByTag(guides: GuideFrontmatter[]): TagGroup[] {
  return GUIDE_TAGS.map((tag) => ({
    tag,
    guides: guides.filter((guide) => guide.tags.includes(tag)),
  })).filter((group) => group.guides.length > 0);
}

/** Tags present in the given guides, in the fixed GUIDE_TAGS order — drives the /guides filter bar. */
export function getAvailableTags(guides: GuideFrontmatter[]): GuideTag[] {
  return GUIDE_TAGS.filter((tag) => guides.some((guide) => guide.tags.includes(tag)));
}
