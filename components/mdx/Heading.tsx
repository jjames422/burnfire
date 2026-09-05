import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type GithubSlugger from "github-slugger";

type HeadingLevel = 2 | 3;

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return extractText(props?.children);
  }
  return "";
}

/**
 * Builds an h2/h3 override bound to a single slugger instance so anchor ids
 * stay unique (and dedup correctly on repeated headings) within one guide
 * render — instantiate a fresh GithubSlugger per page, not at module scope.
 */
export function createHeading(level: HeadingLevel, slugger: GithubSlugger) {
  const sizeClass =
    level === 2 ? "text-2xl md:text-3xl mt-12 mb-4" : "text-xl md:text-2xl mt-8 mb-3";

  return function Heading({ children, ...props }: ComponentPropsWithoutRef<"h2">) {
    const id = slugger.slug(extractText(children));
    const Tag = `h${level}` as "h2" | "h3";

    return (
      <Tag
        id={id}
        className={`group scroll-mt-24 font-display font-semibold text-text-primary ${sizeClass}`}
        {...props}
      >
        {children}
        <a
          href={`#${id}`}
          aria-label="Link to this section"
          className="ml-2 align-middle text-[0.6em] text-accent-bright no-underline opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        >
          #
        </a>
      </Tag>
    );
  };
}
