import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { AllianceSlug } from "@/config/alliances";
import { guideFrontmatterSchema, type Guide, type GuideFrontmatter } from "./types";

const CONTENT_ROOT = path.join(process.cwd(), "content");

function guidesDir(allianceSlug: AllianceSlug): string {
  return path.join(CONTENT_ROOT, allianceSlug, "guides");
}

/** Lists guide slugs by reading the content directory directly — no separate manifest to keep in sync. */
export async function getGuideSlugs(allianceSlug: AllianceSlug): Promise<string[]> {
  let files: string[];
  try {
    files = await readdir(guidesDir(allianceSlug));
  } catch {
    return [];
  }
  return files.filter((file) => file.endsWith(".mdx")).map((file) => file.replace(/\.mdx$/, ""));
}

export async function getGuideBySlug(allianceSlug: AllianceSlug, slug: string): Promise<Guide | null> {
  const filePath = path.join(guidesDir(allianceSlug), `${slug}.mdx`);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return null;
  }
  const { data, content } = matter(raw);
  const frontmatter = guideFrontmatterSchema.parse(data);
  return { frontmatter, content };
}

/**
 * Lightweight catalog for index/listing pages — frontmatter only, no MDX
 * compile. Drafts are excluded here but still directly reachable at their
 * URL (getGuideBySlug doesn't filter drafts), so a link can be shared for
 * review before a guide is published.
 */
export async function getAllGuides(allianceSlug: AllianceSlug): Promise<GuideFrontmatter[]> {
  const slugs = await getGuideSlugs(allianceSlug);
  const guides = await Promise.all(
    slugs.map(async (slug) => (await getGuideBySlug(allianceSlug, slug))?.frontmatter ?? null),
  );

  return guides
    .filter((frontmatter): frontmatter is GuideFrontmatter => frontmatter !== null && !frontmatter.draft)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}
