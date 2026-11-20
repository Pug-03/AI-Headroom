/**
 * Provider-neutral data model. Every adapter converts its CLI's data into a
 * Snapshot; the core and renderers only ever see this shape.
 */

/** Where a limit value came from. Anything but "stdin"/"api" is shown as approximate. */
export type LimitSource = "stdin" | "api" | "log" | "estimate";

export interface Limit {
  /** Stable id used by layouts: "5h", "weekly", or another window id. */
  id: string;
  /** Short display label, e.g. "5h", "Weekly". */
  label: string;
  /** Percent of the allowance used (may exceed 100; renderers clamp). */
  usedPct: number;
  /** Unix timestamp in seconds when the window resets. */
  resetsAt?: number;
  source: LimitSource;
}

export interface ContextUsage {
  /** Tokens currently in the context window, or null if unknown. */
  used: number | null;
  /** Context window size in tokens, or null if unknown. */
  size: number | null;
}

export interface Snapshot {
  provider: string;
  model: string;
  context: ContextUsage;
  limits: Limit[];
  /** Working directory of the session, if the CLI reports it. */
  cwd?: string;
}

export function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Context fill in percent, or null when it cannot be computed. */
export function contextPct(c: ContextUsage): number | null {
  if (c.used === null || c.size === null || c.size <= 0) return null;
  return clampPct((c.used * 100) / c.size);
}

/** Limit window id from its length in minutes. */
export function limitId(minutes: number | null | undefined): string {
  if (minutes === 300) return "5h";
  if (minutes === 10080) return "weekly";
  if (!minutes) return "limit";
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

export function limitLabel(id: string): string {
  return id === "weekly" ? "Weekly" : id === "limit" ? "Limit" : id;
}
