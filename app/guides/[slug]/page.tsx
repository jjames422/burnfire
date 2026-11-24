
import type { ReactNode } from "react";
import { Text } from "@/components/i18n/LanguageProvider";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { getGuideBySlug, getGuideSlugs } from "@/lib/content/guides";
import { site } from "@/config/site";
import { Callout } from "@/components/mdx/Callout";
import { Figure } from "@/components/mdx/Figure";
import { Video } from "@/components/mdx/Video";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/mdx/MdxTable";
import { createHeading } from "@/components/mdx/Heading";
import { remarkHeadingIds } from "@/lib/content/heading-ids";
import { TagChip } from "@/components/guides/TagChip";
import { CommentSection } from "@/components/comments/CommentSection";
import { ReactionBar } from "@/components/comments/ReactionBar";
import { EmberBackdrop, SiteFooter, SiteHeader } from "@/components/layout/SiteChrome";

const mdxComponents = {
  Callout,
  Figure,
  Video,
  table: Table,
  thead: Thead,
  tbody: Tbody,
  tr: Tr,
  th: Th,
  td: Td,
  h2: createHeading(2),
  h3: createHeading(3),
};

// Compiling MDX is the costly part of a guide view. Guide files only change
// with a deployment, so each compiled guide (keyed by its exact source, which
// differs per language) is kept for the life of the server instance and
// reused by later requests. Heading ids are fixed at compile time, so a
// reused guide renders the same as a freshly compiled one.
const MAX_COMPILED_GUIDES = 400;
const compiledGuides = new Map<string, Promise<ReactNode>>();

function compiledGuide(source: string): Promise<ReactNode> {
  const cached = compiledGuides.get(source);
  if (cached) return cached;
  const compiled = compileMDX({
    source,
    options: {
      parseFrontmatter: false,
      mdxOptions: { remarkPlugins: [remarkGfm, remarkHeadingIds] },
    },
    components: mdxComponents,
  }).then(({ content }) => content as ReactNode);
  // A failed compile is not kept, so the next request tries again.
  compiled.catch(() => compiledGuides.delete(source));
  if (compiledGuides.size >= MAX_COMPILED_GUIDES) {
    const oldest = compiledGuides.keys().next().value;
    if (oldest !== undefined) compiledGuides.delete(oldest);
  }
  compiledGuides.set(source, compiled);
  return compiled;
}

export async function generateStaticParams() {
  const slugs = await getGuideSlugs(site.activeAlliance);
  return slugs.map((slug) => ({ slug }));
}

export default async function GuidePage({
  params,
}: PageProps<"/guides/[slug]">) {
  const { slug } = await params;
  const guide = await getGuideBySlug(site.activeAlliance, slug);
  if (!guide) notFound();

  const { frontmatter, content: source } = guide;

  const content = await compiledGuide(source);

  return (
    <main className="public-page">
      <EmberBackdrop />
      <SiteHeader active="guides" />
      <article className="guide-article">
        <header className="guide-article-header">
          <div className="mb-3 flex flex-wrap gap-2">
            {frontmatter.tags.map((tag) => (
              <TagChip key={tag} label={tag} />
            ))}
          </div>
          <h1>
            {frontmatter.title}
          </h1>
          <p className="guide-deck">{frontmatter.summary}</p>
          <p className="guide-byline">
            <Text>{"By"}</Text>{" "}{frontmatter.author}
            {frontmatter.authorRank
              ? ` · ${frontmatter.authorRank}`
              : ""} · {frontmatter.publishedAt}
          </p>
        </header>
        <div className="prose-guide">{content}</div>
      </article>
      <ReactionBar
        alliance={frontmatter.alliance}
        guideSlug={frontmatter.slug}
      />
      <div className="guide-comments">
        <CommentSection
          alliance={frontmatter.alliance}
          guideSlug={frontmatter.slug}
        />
      </div>
      <SiteFooter />
    </main>
  );
}
