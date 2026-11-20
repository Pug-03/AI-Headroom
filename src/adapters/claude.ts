import { withLimitFallback } from "../core/fallback.ts";
import { limitLabel, type Limit, type Snapshot } from "../core/snapshot.ts";
import type { Adapter } from "./types.ts";
import { fetchOauthLimits } from "./claudeOauth.ts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

const WINDOWS: Array<[key: string, id: string]> = [
  ["five_hour", "5h"],
  ["seven_day", "weekly"],
];

/** Parse the JSON Claude Code pipes to a statusLine command. */
export function parseClaudeStdin(raw: string): Snapshot | null {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(j)) return null;

  const model = isObj(j.model) && typeof j.model.display_name === "string" ? j.model.display_name : "Claude";

  let used: number | null = null;
  let size: number | null = null;
  if (isObj(j.context_window)) {
    size = num(j.context_window.context_window_size) ?? null;
    const u = j.context_window.current_usage;
    if (isObj(u)) {
      used = (num(u.input_tokens) ?? 0) + (num(u.cache_creation_input_tokens) ?? 0) + (num(u.cache_read_input_tokens) ?? 0);
    }
  }

  const limits: Limit[] = [];
  if (isObj(j.rate_limits)) {
    for (const [key, id] of WINDOWS) {
      const w = j.rate_limits[key];
      if (!isObj(w)) continue;
      const pct = num(w.used_percentage);
      if (pct === undefined) continue;
      const resetsAt = num(w.resets_at);
      limits.push({ id, label: limitLabel(id), usedPct: pct, ...(resetsAt !== undefined ? { resetsAt } : {}), source: "stdin" });
    }
  }
  const ws = isObj(j.workspace) ? j.workspace.current_dir : undefined;
  const cwd = typeof ws === "string" ? ws : typeof j.cwd === "string" ? j.cwd : undefined;
  return { provider: "claude", model, context: { used, size }, limits, ...(cwd ? { cwd } : {}) };
}

export const claudeAdapter: Adapter = {
  id: "claude",
  async read({ stdin, config, env }) {
    const snap = parseClaudeStdin(stdin);
    if (!snap) return null;
    // stdin first. The OAuth API is only consulted when explicitly enabled.
    return withLimitFallback(snap, config.claude.oauthUsage ? () => fetchOauthLimits(env) : undefined);
  },
};
