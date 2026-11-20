import { clampPct } from "./snapshot.ts";
import { levelStyle, type Segment } from "./style.ts";

/** Progress bar as two segments: filled (colored by level) and empty track. */
export function bar(pct: number, width: number): Segment[] {
  if (width <= 0) return [];
  const p = clampPct(pct);
  const filled = Math.floor((p * width) / 100);
  const out: Segment[] = [];
  if (filled > 0) out.push({ text: "█".repeat(filled), style: levelStyle(p) });
  if (width - filled > 0) out.push({ text: "█".repeat(width - filled), style: "track" });
  return out;
}
