import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { limitId, limitLabel, type Limit, type Snapshot } from "../core/snapshot.ts";
import type { Adapter } from "./types.ts";

/*
 * SECURITY: this adapter reads only `<CODEX_HOME>/sessions/**` and the `model`
 * line of `<CODEX_HOME>/config.toml`. It never opens Codex's credentials file.
 * A test enforces this by scanning the source tree.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function windowLabel(minutes: number | null | undefined): string {
  return limitLabel(limitId(minutes));
}

/**
 * Native path: the state Codex passes to a statusline MCP provider in
 * `params._meta["com.openai/codex-statusline-state"]`. Field names follow the
 * `statusline.d.ts` reference bundled in the Codex binary.
 */
export function fromStatuslineState(state: unknown): Snapshot | null {
  if (!isObj(state)) return null;
  const thread = isObj(state.thread) ? state.thread : {};
  const m = isObj(thread.model) ? thread.model : {};
  const name = typeof m.display_name === "string" ? m.display_name : "Codex";
  const effort = typeof m.reasoning_level === "string" ? ` ${m.reasoning_level}` : "";

  const ctx = isObj(thread.usage) && isObj(thread.usage.context) ? thread.usage.context : {};
  const size = num(ctx.context_window_size) ?? null;
  let used = num(ctx.used_tokens) ?? null;
  if (used === null && size !== null && num(ctx.used_percentage) !== undefined) {
    used = Math.round((size * (ctx.used_percentage as number)) / 100);
  }

  const limits: Limit[] = [];
  const account = isObj(state.account) ? state.account : {};
  const snaps = Array.isArray(account.rate_limits) ? account.rate_limits : [];
  snaps.forEach((snap, i) => {
    if (!isObj(snap)) return;
    const prefix = i > 0 && typeof snap.limit_name === "string" ? `${snap.limit_name} ` : "";
    for (const key of ["primary_limit", "secondary_limit"]) {
      const w = snap[key];
      if (!isObj(w)) continue;
      const pct = num(w.used_percent);
      if (pct === undefined) continue;
      const resetsAt = num(w.resets_at);
      const id = limitId(num(w.window_minutes));
      limits.push({
        id: prefix ? `${prefix.trim().toLowerCase()}-${id}` : id,
        label: `${prefix}${limitLabel(id)}`,
        usedPct: pct,
        ...(resetsAt !== undefined ? { resetsAt } : {}),
        source: "api",
      });
    }
  });
  const ws = isObj(thread.workspace) && typeof thread.workspace.cwd === "string" ? thread.workspace.cwd : undefined;
  return { provider: "codex", model: `${name}${effort}`, context: { used, size }, limits, ...(ws ? { cwd: ws } : {}) };
}

/* ---------- Fallback path: local rollout logs (used by `watch` / `render`) ---------- */

export function codexHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CODEX_HOME || join(homedir(), ".codex");
}

function readRateWindow(w: unknown): Limit | null {
  if (!isObj(w)) return null;
  const pct = num(w.used_percent) ?? num(w.usedPercent);
  if (pct === undefined) return null;
  const minutes = num(w.window_minutes) ?? num(w.windowDurationMins);
  const resetsAt = num(w.resets_at) ?? num(w.resetsAt);
  const id = limitId(minutes);
  return {
    id,
    label: limitLabel(id),
    usedPct: pct,
    ...(resetsAt !== undefined ? { resetsAt } : {}),
    source: "log",
  };
}

/** Parse the text of a Codex rollout `.jsonl`. Tolerant of unknown/missing events. */
export function parseRollout(text: string, fallbackModel = "Codex"): Snapshot {
  let model = fallbackModel;
  let used: number | null = null;
  let size: number | null = null;
  let limits: Limit[] = [];
  let cwd: string | undefined;
  for (const line of text.split("\n")) {
    if (!line.includes('"token_count"') && !line.includes('"turn_context"') && !line.includes('"session_meta"')) continue;
    let ev: unknown;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObj(ev) || !isObj(ev.payload)) continue;
    const p = ev.payload;
    if (ev.type === "turn_context" && typeof p.model === "string") model = p.model;
    if ((ev.type === "session_meta" || ev.type === "turn_context") && typeof p.cwd === "string") cwd = p.cwd;
    if (p.type === "token_count") {
      if (isObj(p.info)) {
        const last = isObj(p.info.last_token_usage) ? p.info.last_token_usage : {};
        used = num(last.total_tokens) ?? used;
        size = num(p.info.model_context_window) ?? size;
      }
      if (isObj(p.rate_limits)) {
        const next = [readRateWindow(p.rate_limits.primary), readRateWindow(p.rate_limits.secondary)];
        const found = next.filter((l): l is Limit => l !== null);
        if (found.length > 0) limits = found;
      }
    }
  }
  return { provider: "codex", model, context: { used, size }, limits, ...(cwd ? { cwd } : {}) };
}

/** Extract only the top-level `model = "..."` line from config.toml. */
export function readConfiguredModel(env: NodeJS.ProcessEnv = process.env): string | undefined {
  try {
    const toml = readFileSync(join(codexHome(env), "config.toml"), "utf8");
    // Only the part before the first [table] header holds top-level keys.
    const top = toml.split(/^\s*\[/m)[0] ?? "";
    return /^\s*model\s*=\s*"([^"]+)"/m.exec(top)?.[1];
  } catch {
    return undefined;
  }
}

/** Newest rollout file under `<CODEX_HOME>/sessions/YYYY/MM/DD/`. */
export function latestRollout(env: NodeJS.ProcessEnv = process.env): string | null {
  const walk = (dir: string, depth: number): string | null => {
    let names: string[];
    try {
      names = readdirSync(dir).sort().reverse();
    } catch {
      return null;
    }
    for (const n of names) {
      if (depth === 3) {
        if (n.endsWith(".jsonl")) return join(dir, n);
      } else {
        const hit = walk(join(dir, n), depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(join(codexHome(env), "sessions"), 0);
}

export const codexAdapter: Adapter = {
  id: "codex",
  async read({ env }) {
    const file = latestRollout(env);
    const model = readConfiguredModel(env);
    if (!file) return model ? { provider: "codex", model, context: { used: null, size: null }, limits: [] } : null;
    try {
      return parseRollout(readFileSync(file, "utf8"), model ?? "Codex");
    } catch {
      return null;
    }
  },
};
