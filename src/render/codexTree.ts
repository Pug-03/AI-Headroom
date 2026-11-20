import { PALETTE, rgbHex, type Item, type Line, type Part, type StyleName } from "../core/style.ts";

/**
 * Codex's footer takes a JSON UI tree instead of ANSI text. Limits (from
 * Codex's bundled docs): 64 KiB JSON, 256 non-null nodes, depth 16.
 *
 * Codex trims whitespace inside text nodes, so all spacing is expressed with
 * row `gap`s: segments gap 0, parts gap 1, items gap 1 with a separator node.
 *
 * The footer is a single row. Codex rejects control characters (including
 * "\n") in text, and a rejected read makes it stop polling and fall back to
 * its default footer. Multiple layout lines are therefore joined with "·";
 * the row wraps only when it is wider than the terminal.
 */
export type CodexElement =
  | string
  | { type: "text"; props?: { color?: string }; children: CodexElement[] }
  | { type: "row"; props: { gap: number; wrap?: "nowrap" | "wrap" }; children: CodexElement[] };

export interface CodexTreeOptions {
  separator?: string;
}

const MAX_NODES = 256;

function color(style: StyleName): string | undefined {
  if (style === "dim") return "status-metadata";
  const c = PALETTE[style];
  return c ? rgbHex(c) : undefined;
}

const textNode = (t: string, style: StyleName): CodexElement => {
  const c = color(style);
  return { type: "text", ...(c ? { props: { color: c } } : {}), children: [t] };
};

const row = (gap: number, children: CodexElement[], wrap: "nowrap" | "wrap" = "nowrap"): CodexElement =>
  children.length === 1 && gap >= 0 && wrap === "nowrap" ? children[0]! : { type: "row", props: { gap, wrap }, children };

const partNode = (p: Part) => row(0, p.map((s) => textNode(s.text, s.style)));
const itemNode = (it: Item) => row(1, it.map(partNode));

function lineNode(line: Line, separator: string): CodexElement {
  const kids: CodexElement[] = [];
  line.forEach((it, i) => {
    if (i > 0 && separator !== "") kids.push(textNode(separator, "dim"));
    kids.push(itemNode(it));
  });
  return row(1, kids, "wrap");
}

function countNodes(e: CodexElement): number {
  return 1 + (typeof e === "string" ? 0 : e.children.reduce((n, c) => n + countNodes(c), 0));
}

export function renderCodexTree(lines: Line[], o: CodexTreeOptions = {}): CodexElement | null {
  const separator = o.separator ?? "|";
  const rows = lines.filter((l) => l.length > 0).map((l) => lineNode(l, separator));
  if (rows.length === 0) return null;

  let tree: CodexElement;
  if (rows.length === 1) tree = rows[0]!;
  else {
    const kids: CodexElement[] = [];
    rows.forEach((r, i) => {
      if (i > 0) kids.push(textNode("·", "dim"));
      kids.push(r);
    });
    tree = { type: "row", props: { gap: 1, wrap: "wrap" }, children: kids };
  }
  // Too many nodes: fall back to the first line only (always small).
  return countNodes(tree) <= MAX_NODES ? tree : rows[0]!;
}
