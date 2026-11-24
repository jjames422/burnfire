import type { ComponentPropsWithoutRef, ReactNode } from "react";
import GithubSlugger from "github-slugger";
import { getTranslator } from "@/lib/i18n/server";

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
 * Builds an h2/h3 override. Anchor ids are assigned once per guide at compile
 * time (lib/content/heading-ids.ts), so they stay unique and stable however
 * many times the compiled guide is rendered. The fallback only covers a
 * heading compiled without that plugin.
 */
export function createHeading(level: HeadingLevel) {
  const sizeClass =
    level === 2 ? "text-2xl md:text-3xl mt-12 mb-4" : "text-xl md:text-2xl mt-8 mb-3";

  return async function Heading({ children, id: compiledId, ...props }: ComponentPropsWithoutRef<"h2">) {
    const t = await getTranslator();
    const id = compiledId ?? new GithubSlugger().slug(extractText(children));
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
          aria-label={t("Link to this section")}
          className="ms-2 align-middle text-[0.6em] text-accent-bright no-underline opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        >
          #
        </a>
      </Tag>
    );
  };
}
