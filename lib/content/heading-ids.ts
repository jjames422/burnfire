import GithubSlugger from "github-slugger";

type MdastNode = {
  type: string;
  depth?: number;
  value?: string;
  children?: MdastNode[];
  data?: { hProperties?: Record<string, unknown> } & Record<string, unknown>;
};

function textOf(node: MdastNode): string {
  if (typeof node.value === "string") return node.value;
  return node.children?.map(textOf).join("") ?? "";
}

function visitHeadings(node: MdastNode, slugger: GithubSlugger): void {
  if (node.type === "heading" && (node.depth === 2 || node.depth === 3)) {
    node.data = node.data ?? {};
    node.data.hProperties = { ...node.data.hProperties, id: slugger.slug(textOf(node)) };
  }
  for (const child of node.children ?? []) visitHeadings(child, slugger);
}

/**
 * Gives every h2/h3 its anchor id while the guide is compiled, in document
 * order with one slugger per guide, so repeated headings dedupe the same way
 * on every render. Because the ids live in the compiled output, a compiled
 * guide can be reused across requests instead of being recompiled each view.
 */
export function remarkHeadingIds() {
  return (tree: unknown) => {
    visitHeadings(tree as MdastNode, new GithubSlugger());
  };
}
