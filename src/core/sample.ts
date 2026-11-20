import type { Snapshot } from "./snapshot.ts";

/** Fixed sample data for `aiheadroom preview`. */
export function sampleSnapshot(provider: string, now: number): Snapshot {
  return {
    provider,
    model: provider === "codex" ? "gpt-6-sol medium" : "Sonnet 5.5",
    context: { used: 182_000, size: 258_000 },
    limits: [
      { id: "5h", label: "5h", usedPct: 41, resetsAt: now + 2 * 3600, source: "api" },
      { id: "weekly", label: "Weekly", usedPct: 93, resetsAt: now + 5 * 86_400, source: "api" },
    ],
    cwd: "/Users/you/Code/shop-api",
  };
}
