import { clampPct } from "./snapshot.js";
import { levelStyle,              } from "./style.js";

/** Progress bar as two segments: filled (colored by level) and empty track. */
export function bar(pct        , width        )            {
  if (width <= 0) return [];
  const p = clampPct(pct);
  const filled = Math.floor((p * width) / 100);
  const out            = [];
  if (filled > 0) out.push({ text: "█".repeat(filled), style: levelStyle(p) });
  if (width - filled > 0) out.push({ text: "█".repeat(width - filled), style: "track" });
  return out;
}
