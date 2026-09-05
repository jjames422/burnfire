import { z } from "zod";

export const GUIDE_TAGS = [
  "Hero",
  "Building",
  "Clinic",
  "PVP",
  "PVE",
  "Alliance",
  "Events",
  "Patch Notes",
] as const;

export type GuideTag = (typeof GUIDE_TAGS)[number];

export const guideFrontmatterSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  tags: z.array(z.enum(GUIDE_TAGS)).min(1),
  summary: z.string().min(1),
  heroImage: z.string().optional(),
  author: z.string().min(1),
  authorRank: z.string().optional(),
  publishedAt: z.string().min(1),
  updatedAt: z.string().optional(),
  alliance: z.string().min(1),
  draft: z.boolean().default(false),
});

export type GuideFrontmatter = z.infer<typeof guideFrontmatterSchema>;

export interface Guide {
  frontmatter: GuideFrontmatter;
  /** Raw MDX body, not yet compiled. */
  content: string;
}
