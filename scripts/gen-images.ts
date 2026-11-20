/**
 * Generate the screenshots used by the website and README from real AI Headroom
 * output: every image goes through the same layout() code the CLI uses.
 *
 *   npm run images      → site/assets/*.svg
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { layout, type LayoutOptions } from "../src/core/layout.ts";
import type { Snapshot } from "../src/core/snapshot.ts";
import { PALETTE, rgbHex, type Line, type StyleName } from "../src/core/style.ts";

const OUT = new URL("../site/assets/", import.meta.url);
mkdirSync(OUT, { recursive: true });

// Fixed clock so images are reproducible: Fri 2026-11-20 14:00 local.
const NOW = Math.floor(new Date(2026, 10, 20, 14, 0, 0).getTime() / 1000);

const FONT = 14;
const CHAR_W = 8.43; // Menlo/SF Mono advance at 14px
const LINE_H = 21;
const PAD_X = 22;
const BG = "#1d2130";
const FG = "#c9cfdb";
const MUTED = "#6c7489";

/* ---------- sample data ---------- */

const claude: Snapshot = {
  provider: "claude",
  model: "Sonnet 5.5",
  context: { used: 182_000, size: 1_000_000 },
  limits: [
    { id: "5h", label: "5h", usedPct: 41, resetsAt: NOW + 2 * 3600 + 900, source: "stdin" },
    { id: "weekly", label: "Weekly", usedPct: 74, resetsAt: NOW + 5 * 86_400, source: "stdin" },
  ],
  cwd: "/Users/you/Code/shop-api",
};

const codex: Snapshot = {
  provider: "codex",
  model: "gpt-6-sol medium",
  context: { used: 19_000, size: 258_000 },
  limits: [
    { id: "5h", label: "5h", usedPct: 12, resetsAt: NOW + 4 * 3600, source: "api" },
    { id: "weekly", label: "Weekly", usedPct: 33, resetsAt: NOW + 6 * 86_400, source: "api" },
  ],
  cwd: "/Users/you/Code/shop-api",
};

const withCtx = (s: Snapshot, pct: number): Snapshot => ({
  ...s,
  context: { used: Math.round(((s.context.size ?? 0) * pct) / 100), size: s.context.size },
});

/* ---------- text runs ---------- */

interface Run {
  text: string;
  color: string;
  dim?: boolean;
}

function color(style: StyleName, mono: boolean): Run["color"] {
  if (mono) return style === "dim" ? MUTED : FG;
  if (style === "dim") return MUTED;
  const c = PALETTE[style];
  return c ? rgbHex(c) : FG;
}

/** Same spacing rules as render/ansi.ts. */
function runs(lines: Line[], separator = "|", mono = false): Run[][] {
  return lines.map((line) => {
    const out: Run[] = [];
    line.forEach((item, i) => {
      if (i > 0) out.push({ text: separator === "" ? " " : ` ${separator} `, color: MUTED });
      item.forEach((part, j) => {
        if (j > 0) out.push({ text: " ", color: FG });
        for (const seg of part) {
          const text = mono && seg.style === "track" ? seg.text.replaceAll("█", "░") : seg.text;
          out.push({ text, color: color(seg.style, mono) });
        }
      });
    });
    return out;
  });
}

/** Codex footer: one row, lines joined with " · " (see render/codexTree.ts). */
function codexRow(lines: Line[], separator = "|"): Run[][] {
  const rows = runs(lines, separator);
  const joined: Run[] = [];
  rows.forEach((r, i) => {
    if (i > 0) joined.push({ text: " · ", color: MUTED });
    joined.push(...r);
  });
  return [joined];
}

const width = (r: Run[]) => r.reduce((n, x) => n + [...x.text].length, 0);

/* ---------- svg ---------- */

const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function textLine(r: Run[], x: number, y: number): string {
  const spans = r.map((s) => `<tspan fill="${s.color}">${esc(s.text)}</tspan>`).join("");
  return `<text x="${x}" y="${y}" xml:space="preserve">${spans}</text>`;
}

type Block =
  | { kind: "text"; runs: Run[] }
  | { kind: "gap" }
  | { kind: "rule" }
  | { kind: "input"; text: string };

const plain = (text: string, c = MUTED): Block => ({ kind: "text", runs: [{ text, color: c }] });

function terminal(title: string, blocks: Block[], cols: number): string {
  const w = Math.round(PAD_X * 2 + cols * CHAR_W);
  const top = 40;
  let y = top + 14;
  const body: string[] = [];
  for (const b of blocks) {
    if (b.kind === "gap") {
      y += LINE_H * 0.6;
      continue;
    }
    if (b.kind === "rule") {
      body.push(`<line x1="${PAD_X}" x2="${w - PAD_X}" y1="${y + 4}" y2="${y + 4}" stroke="#3a4054" stroke-width="1"/>`);
      y += 12;
      continue;
    }
    y += LINE_H;
    if (b.kind === "input") {
      body.push(`<rect x="${PAD_X - 8}" y="${y - 16}" width="${w - 2 * PAD_X + 16}" height="${LINE_H + 8}" rx="4" fill="#2a2f40"/>`);
      body.push(textLine([{ text: "› ", color: FG }, { text: b.text, color: MUTED }], PAD_X, y));
      y += 8;
      continue;
    }
    body.push(textLine(b.runs, PAD_X, y));
  }
  const h = Math.round(y + 22);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<rect width="${w}" height="${h}" rx="10" fill="${BG}"/>
<rect width="${w}" height="30" rx="10" fill="#272c3c"/><rect y="20" width="${w}" height="10" fill="#272c3c"/>
<circle cx="18" cy="15" r="5.5" fill="#ff5f57"/><circle cx="36" cy="15" r="5.5" fill="#febc2e"/><circle cx="54" cy="15" r="5.5" fill="#28c840"/>
<text x="${w / 2}" y="19.5" text-anchor="middle" fill="${MUTED}" font-family="-apple-system, Segoe UI, sans-serif" font-size="12">${esc(title)}</text>
<g font-family="SF Mono, Menlo, Consolas, 'DejaVu Sans Mono', monospace" font-size="${FONT}">
${body.join("\n")}
</g>
</svg>
`;
}

function save(name: string, svg: string) {
  writeFileSync(new URL(name, OUT), svg);
  console.log(`site/assets/${name}`);
}

const L = (s: Snapshot, o: LayoutOptions = {}) => layout(s, { now: NOW, ...o });

/* ---------- images ---------- */

// 1. Claude Code, default two-line layout.
{
  const status = runs(L(claude)).map((r): Block => ({ kind: "text", runs: r }));
  save(
    "claude.svg",
    terminal("Claude Code — shop-api", [
      plain("> add pagination to /orders", FG),
      plain("● Added cursor-based pagination to GET /orders and updated the tests."),
      { kind: "gap" },
      { kind: "rule" },
      plain("> ", FG),
      { kind: "rule" },
      ...status,
      plain("⏵⏵ auto mode on (shift+tab to cycle)"),
    ], 80),
  );
}

// 2. Codex CLI footer (one row).
{
  const [row] = codexRow(L(codex, { barWidth: 8 }));
  save(
    "codex.svg",
    terminal("codex — shop-api", [
      plain("› hi", FG),
      plain("• Hi! What are you working on?", FG),
      plain("  Worked for 2s"),
      { kind: "gap" },
      { kind: "input", text: "Ask Codex to do anything" },
      { kind: "text", runs: row! },
      plain("← for agents · ? for shortcuts"),
    ], Math.max(80, width(row!) + 1)),
  );
}

// 3. Color levels.
{
  const one = (pct: number, note: string): Block[] => [
    { kind: "text", runs: [...runs(L(withCtx(claude, pct), { lines: [["model", "context", "tokens"]] }))[0]!, { text: `   ${note}`, color: MUTED }] },
  ];
  save(
    "levels.svg",
    terminal("Bars change color as they fill", [
      ...one(35, "under 70%: green"),
      ...one(78, "70% and up: orange"),
      ...one(94, "90% and up: red"),
    ], 74),
  );
}

// 4. Custom layouts.
{
  const minimal = runs(L(claude, { lines: [["model", "context"]] }));
  save("layout-minimal.svg", terminal('"lines": [["model", "context"]]', minimal.map((r) => ({ kind: "text", runs: r })), 60));

  const detailedLines = [["model", "cwd"], ["context", "tokens", "remaining"], ["limit-5h"], ["limit-weekly"]];
  const detailed = runs(L(claude, { lines: detailedLines }));
  save("layout-detailed.svg", terminal("Four lines: model, context, each limit", detailed.map((r) => ({ kind: "text", runs: r })), 60));

  const dotsLines = [["text:◆", "model", "limit-5h", "limit-weekly"]];
  const dots = runs(L(claude, { lines: dotsLines, separator: "·", barWidth: 6, showResets: false }), "·");
  save("layout-dots.svg", terminal('separator "·", barWidth 6, no reset times', dots.map((r) => ({ kind: "text", runs: r })), 64));
}

// 5. Narrow terminals.
{
  const blocks: Block[] = [];
  for (const cols of [72, 46, 30, 20]) {
    blocks.push(plain(`── ${cols} columns ${"─".repeat(Math.max(0, cols - 13 - String(cols).length))}`));
    for (const r of runs(L(claude, { columns: cols }))) blocks.push({ kind: "text", runs: r });
    blocks.push({ kind: "gap" });
  }
  save("resize.svg", terminal("Fits any width: bar shrinks, then items drop", blocks, 74));
}

// 6. NO_COLOR.
{
  const lines = runs(L(claude), "|", true);
  save("nocolor.svg", terminal("NO_COLOR=1", lines.map((r) => ({ kind: "text", runs: r })), 80));
}

// 7. Estimated limits (from local logs) are marked with "~".
{
  const est: Snapshot = {
    ...codex,
    model: "gpt-6-sol",
    limits: codex.limits.map((l) => ({ ...l, source: "log" as const })),
  };
  const lines = runs(L(est, { lines: [["model", "tokens"], ["limits"]] }));
  save("estimate.svg", terminal("aiheadroom watch --provider codex", lines.map((r) => ({ kind: "text", runs: r })), 80));
}
