import { homedir } from "node:os";
import { basename } from "node:path";
import { bar } from "./bar.ts";
import { formatReset, formatTokens } from "./format.ts";
import { clampPct, contextPct, type Limit, type Snapshot } from "./snapshot.ts";
import { levelStyle, type Item, type Part } from "./style.ts";

export interface WidgetContext {
  barWidth: number;
  showResets: boolean;
  now: number;
}

type Widget = (s: Snapshot, c: WidgetContext) => Item[];

const text = (t: string, style: Part[number]["style"] = "text"): Part => [{ text: t, style }];

function pctPart(pct: number, approx: boolean): Part {
  return text(`${approx ? "~" : ""}${clampPct(pct)}%`, levelStyle(pct));
}

function meter(pct: number, approx: boolean, c: WidgetContext): Part[] {
  const b = bar(pct, c.barWidth);
  return b.length > 0 ? [b, pctPart(pct, approx)] : [pctPart(pct, approx)];
}

function limitItem(l: Limit, c: WidgetContext): Item {
  const approx = l.source === "log" || l.source === "estimate";
  const item: Item = [text(l.label), ...meter(l.usedPct, approx, c)];
  if (c.showResets && l.resetsAt !== undefined) item.push(text(formatReset(l.resetsAt, c.now), "dim"));
  return item;
}

function shortCwd(cwd: string): string {
  const home = homedir();
  if (cwd === home) return "~";
  return basename(cwd) || cwd;
}

/** Built-in widgets. Each returns zero or more items (zero when the data is missing). */
export const WIDGETS: Record<string, { describe: string; render: Widget }> = {
  model: { describe: "Model name", render: (s) => [[text(s.model)]] },
  provider: { describe: "Which CLI (claude, codex)", render: (s) => [[text(s.provider, "dim")]] },
  context: {
    describe: "Context window bar and percent",
    render: (s, c) => {
      const p = contextPct(s.context);
      return p === null ? [] : [meter(p, false, c)];
    },
  },
  tokens: {
    describe: "Tokens used / window size, e.g. 19k/258k",
    render: (s) => {
      const { used, size } = s.context;
      if (used === null) return [];
      return [[text(size ? `${formatTokens(used)}/${formatTokens(size)}` : formatTokens(used))]];
    },
  },
  remaining: {
    describe: "Tokens left in the context window, e.g. 239k left",
    render: (s) => {
      const { used, size } = s.context;
      if (used === null || !size) return [];
      return [[text(`${formatTokens(Math.max(0, size - used))} left`, "dim")]];
    },
  },
  "limit-5h": {
    describe: "5-hour limit bar, percent and reset time",
    render: (s, c) => s.limits.filter((l) => l.id === "5h").map((l) => limitItem(l, c)),
  },
  "limit-weekly": {
    describe: "Weekly limit bar, percent and reset time",
    render: (s, c) => s.limits.filter((l) => l.id === "weekly").map((l) => limitItem(l, c)),
  },
  limits: {
    describe: "Every limit the CLI reports",
    render: (s, c) => s.limits.map((l) => limitItem(l, c)),
  },
  cwd: {
    describe: "Current folder name",
    render: (s) => (s.cwd ? [[text(shortCwd(s.cwd), "dim")]] : []),
  },
};

/** Also accepted in layouts: "text:<anything>" renders literal text. */
export function renderWidget(id: string, s: Snapshot, c: WidgetContext): Item[] {
  if (id.startsWith("text:")) {
    const t = id.slice(5).trim();
    return t ? [[text(t, "dim")]] : [];
  }
  return WIDGETS[id]?.render(s, c) ?? [];
}

export function isKnownWidget(id: string): boolean {
  return id in WIDGETS || id.startsWith("text:");
}
