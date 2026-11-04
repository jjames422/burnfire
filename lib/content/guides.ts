import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { alliances, type AllianceSlug } from "@/config/alliances";
import { getLocale } from "@/lib/i18n/server";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { isTranslationFresh } from "./localization";
import { guideFrontmatterSchema, type Guide, type GuideFrontmatter } from "./types";

const CONTENT_ROOT = path.join(process.cwd(), "content");
const GUIDE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isAllianceSlug(value: string): value is AllianceSlug {
  return Object.hasOwn(alliances, value);
}

function guidesDir(allianceSlug: AllianceSlug, locale?: Locale): string {
  if (!isAllianceSlug(allianceSlug)) throw new Error("Unknown alliance content");
  if (locale && !isLocale(locale)) throw new Error("Unsupported content locale");
  if (locale && locale !== "en") {
    return path.join(CONTENT_ROOT, allianceSlug, "locales", locale, "guides");
  }
  return path.join(CONTENT_ROOT, allianceSlug, "guides");
}

async function resolveLocale(locale?: Locale): Promise<Locale> {
  if (locale !== undefined) {
    if (!isLocale(locale)) throw new Error("Unsupported content locale");
    return locale;
  }
  return getLocale();
}

/** Lists guide slugs by reading the content directory directly — no separate manifest to keep in sync. */
export async function getGuideSlugs(allianceSlug: AllianceSlug): Promise<string[]> {
  let files: string[];
  try {
    // Slugs are canonical and locale-independent, including in generateStaticParams.
    files = await readdir(guidesDir(allianceSlug, "en"));
  } catch (error) {
    if (missingFile(error)) return [];
    throw error;
  }
  return files
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx$/, ""))
    .filter((slug) => GUIDE_SLUG_PATTERN.test(slug));
}

async function readGuide(filePath: string): Promise<Guide | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (missingFile(error)) return null;
    throw error;
  }
  const { data, content } = matter(raw);
  const frontmatter = guideFrontmatterSchema.parse(data);
  return { frontmatter, content };
}

async function sourceSnapshot(allianceSlug: AllianceSlug, slug: string): Promise<string | null> {
  try {
    return await readFile(path.join(guidesDir(allianceSlug, "en"), `${slug}.mdx`), "utf8");
  } catch (error) {
    if (missingFile(error)) return null;
    throw error;
  }
}

async function isFreshGuideTranslation(
  allianceSlug: AllianceSlug,
  slug: string,
  locale: Locale,
  source: string,
): Promise<boolean> {
  try {
    const manifestPath = path.join(CONTENT_ROOT, allianceSlug, "locales", locale, "manifest.json");
    const manifest: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Invalid guide translation manifest");
    const guides = (manifest as { guides?: unknown }).guides;
    if (!guides || typeof guides !== "object" || Array.isArray(guides)) throw new Error("Invalid guide translation manifest");
    return isTranslationFresh(source, (guides as Record<string, unknown>)[slug]);
  } catch (error) {
    if (missingFile(error)) return false;
    throw error;
  }
}

function markEnglishFallback(guide: Guide, locale: Locale): Guide {
  return {
    frontmatter: {
      ...guide.frontmatter,
      title: `English original: ${guide.frontmatter.title}`,
      summary: `English original: ${guide.frontmatter.summary}`,
    },
    content: `> **English original:** A reviewed ${locale} translation is not available yet. The guide below is in English.\n\n${guide.content}`,
  };
}

function preservesCanonicalMetadata(localized: GuideFrontmatter, source: GuideFrontmatter): boolean {
  return localized.slug === source.slug &&
    localized.tags.length === source.tags.length &&
    localized.tags.every((tag, index) => tag === source.tags[index]) &&
    localized.heroImage === source.heroImage &&
    localized.author === source.author &&
    localized.authorRank === source.authorRank &&
    localized.publishedAt === source.publishedAt &&
    localized.updatedAt === source.updatedAt &&
    localized.alliance === source.alliance &&
    localized.draft === source.draft;
}

export async function getGuideBySlug(
  allianceSlug: AllianceSlug,
  slug: string,
  locale?: Locale,
): Promise<Guide | null> {
  if (!isAllianceSlug(allianceSlug) || typeof slug !== "string" || !GUIDE_SLUG_PATTERN.test(slug)) {
    return null;
  }

  const resolvedLocale = await resolveLocale(locale);
  const sourceSnapshotText = await sourceSnapshot(allianceSlug, slug);
  if (!sourceSnapshotText) return null;
  const englishGuide = await readGuide(path.join(guidesDir(allianceSlug, "en"), `${slug}.mdx`));
  if (!englishGuide) return null;
  if (resolvedLocale === "en") return englishGuide;

  const localizedGuide = await readGuide(path.join(guidesDir(allianceSlug, resolvedLocale), `${slug}.mdx`));
  if (localizedGuide &&
    preservesCanonicalMetadata(localizedGuide.frontmatter, englishGuide.frontmatter) &&
    await isFreshGuideTranslation(allianceSlug, slug, resolvedLocale, sourceSnapshotText)) {
    return localizedGuide;
  }

  return markEnglishFallback(englishGuide, resolvedLocale);
}

/**
 * Lightweight catalog for index/listing pages — frontmatter only, no MDX
 * compile. Drafts are excluded here but still directly reachable at their
 * URL (getGuideBySlug doesn't filter drafts), so a link can be shared for
 * review before a guide is published.
 */
export async function getAllGuides(
  allianceSlug: AllianceSlug,
  locale?: Locale,
): Promise<GuideFrontmatter[]> {
  if (!isAllianceSlug(allianceSlug)) return [];
  const resolvedLocale = await resolveLocale(locale);
  const slugs = await getGuideSlugs(allianceSlug);
  const guides = await Promise.all(
    slugs.map(async (slug) =>
      (await getGuideBySlug(allianceSlug, slug, resolvedLocale))?.frontmatter ?? null,
    ),
  );

  return guides
    .filter((frontmatter): frontmatter is GuideFrontmatter => frontmatter !== null && !frontmatter.draft)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}
