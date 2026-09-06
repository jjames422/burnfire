import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import GithubSlugger from "github-slugger";
import remarkGfm from "remark-gfm";
import { getGuideBySlug, getGuideSlugs } from "@/lib/content/guides";
import { site } from "@/config/site";
import { Callout } from "@/components/mdx/Callout";
import { Figure } from "@/components/mdx/Figure";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/mdx/MdxTable";
import { createHeading } from "@/components/mdx/Heading";
import { TagChip } from "@/components/guides/TagChip";
import { CommentSection } from "@/components/comments/CommentSection";
import { ReactionBar } from "@/components/comments/ReactionBar";
import { AuthGate } from "@/components/auth/AuthGate";

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

  // Fresh per-render so heading ids dedupe correctly within this guide
  // without leaking slug state across concurrent requests for other guides.
  const slugger = new GithubSlugger();
  const { content } = await compileMDX({
    source,
    options: {
      parseFrontmatter: false,
      mdxOptions: { remarkPlugins: [remarkGfm] },
    },
    components: {
      Callout,
      Figure,
      table: Table,
      thead: Thead,
      tbody: Tbody,
      tr: Tr,
      th: Th,
      td: Td,
      h2: createHeading(2, slugger),
      h3: createHeading(3, slugger),
    },
  });

  return (
    <>
      <article className="mx-auto w-full max-w-3xl px-6 py-12">
        <header className="mb-8 border-b border-border pb-6">
          <div className="mb-3 flex flex-wrap gap-2">
            {frontmatter.tags.map((tag) => (
              <TagChip key={tag} label={tag} />
            ))}
          </div>
          <h1 className="font-display text-3xl font-bold text-text-primary md:text-4xl">
            {frontmatter.title}
          </h1>
          <p className="mt-2 text-text-secondary">{frontmatter.summary}</p>
          <p className="mt-4 text-sm text-text-secondary">
            By {frontmatter.author}
            {frontmatter.authorRank ? ` · ${frontmatter.authorRank}` : ""} · {frontmatter.publishedAt}
          </p>
        </header>
        <div className="prose-guide">{content}</div>
      </article>
      <ReactionBar alliance={frontmatter.alliance} guideSlug={frontmatter.slug} />
      <div className="mx-auto mt-4 w-full max-w-3xl px-6">
        <AuthGate
          alliance={frontmatter.alliance}
          redirectPath={`/guides/${frontmatter.slug}`}
          featureName="Comments"
        >
          <CommentSection alliance={frontmatter.alliance} guideSlug={frontmatter.slug} />
        </AuthGate>
      </div>
    </>
  );
}
