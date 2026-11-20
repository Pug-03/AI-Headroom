import type { Snapshot } from "./snapshot.ts";
import { itemWidth, lineWidth, sepWidth, truncateItem, type Line } from "./style.ts";
import { renderWidget, type WidgetContext } from "./widgets.ts";

/** Default: model and context on top, limits underneath. */
export const DEFAULT_LINES: string[][] = [
  ["model", "context", "tokens"],
  ["limit-5h", "limit-weekly"],
];

export interface LayoutOptions {
  /** Widget ids per line. See `aiheadroom items`. */
  lines?: string[][];
  /** Terminal width. Omit for "unlimited" (e.g. no TTY). */
  columns?: number;
  /** Preferred bar width; shrinks automatically when space is tight. */
  barWidth?: number;
  separator?: string;
  showResets?: boolean;
  /** Current time in unix seconds. Injectable for tests. */
  now?: number;
}

function build(s: Snapshot, lines: string[][], c: WidgetContext): Line[] {
  return lines
    .map((ids) => ids.flatMap((id) => renderWidget(id, s, c)))
    .filter((line) => line.length > 0);
}

/** Drop trailing items, then truncate the last one, until the line fits. */
function fit(line: Line, cols: number, separator: string): Line {
  const out = [...line];
  while (out.length > 1 && lineWidth(out, separator) > cols) out.pop();
  if (lineWidth(out, separator) <= cols) return out;
  const last = out.pop()!;
  const room = cols - (out.length > 0 ? lineWidth(out, separator) + sepWidth(separator) : 0);
  const cut = truncateItem(last, room);
  return cut.length > 0 && itemWidth(cut) > 0 ? [...out, cut] : out;
}

/**
 * Build the lines for a snapshot. When the terminal is narrow the bar shrinks
 * (10 → 5 → none), then trailing items are dropped and the last one is cut with
 * "…", so a resize never produces wrapped (broken) output.
 */
export function layout(s: Snapshot, o: LayoutOptions = {}): Line[] {
  const lines = o.lines ?? DEFAULT_LINES;
  const cols = o.columns ?? Number.POSITIVE_INFINITY;
  const separator = o.separator ?? "|";
  const want = o.barWidth ?? 10;
  const base = { showResets: o.showResets ?? true, now: o.now ?? Math.floor(Date.now() / 1000) };
  for (const barWidth of [...new Set([want, Math.min(want, 5), 0])]) {
    const built = build(s, lines, { ...base, barWidth });
    if (built.every((l) => lineWidth(l, separator) <= cols)) return built;
  }
  return build(s, lines, { ...base, barWidth: 0 })
    .map((l) => fit(l, cols, separator))
    .filter((l) => l.length > 0);
}
