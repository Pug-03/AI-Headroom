import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Limit } from "../core/snapshot.ts";

/**
 * OPT-IN ONLY. Called only when config.claude.oauthUsage is true (or
 * AIHEADROOM_CLAUDE_OAUTH=1) and stdin carried no rate_limits. Uses the token
 * Claude Code already stored for you; nothing is sent anywhere but
 * api.anthropic.com. The endpoint is undocumented and may change.
 */
const exec = promisify(execFile);
const CACHE_TTL_S = 60;

async function getToken(env: NodeJS.ProcessEnv): Promise<string | null> {
  if (env.CLAUDE_CODE_OAUTH_TOKEN) return env.CLAUDE_CODE_OAUTH_TOKEN;
  if (process.platform !== "darwin") return null;
  try {
    const { stdout } = await exec("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], {
      timeout: 3000,
    });
    const token = JSON.parse(stdout)?.claudeAiOauth?.accessToken;
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
}

function cachePath(): string {
  const dir = join(tmpdir(), `aiheadroom-${userInfo().uid}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return join(dir, "claude-usage.json");
}

interface UsageWindow {
  utilization?: number;
  resets_at?: string;
}

export function parseOauthUsage(json: unknown): Limit[] {
  const j = json as { five_hour?: UsageWindow; seven_day?: UsageWindow } | null;
  const toLimit = (id: string, label: string, w?: UsageWindow): Limit[] => {
    if (!w || typeof w.utilization !== "number") return [];
    const ms = w.resets_at ? Date.parse(w.resets_at) : NaN;
    return [{
      id,
      label,
      usedPct: w.utilization,
      ...(Number.isNaN(ms) ? {} : { resetsAt: Math.floor(ms / 1000) }),
      source: "api" as const,
    }];
  };
  return [...toLimit("5h", "5h", j?.five_hour), ...toLimit("weekly", "Weekly", j?.seven_day)];
}

export async function fetchOauthLimits(env: NodeJS.ProcessEnv = process.env): Promise<Limit[]> {
  const file = cachePath();
  try {
    if (Date.now() - statSync(file).mtimeMs < CACHE_TTL_S * 1000) {
      return parseOauthUsage(JSON.parse(readFileSync(file, "utf8")));
    }
  } catch {
    // no cache yet
  }
  const token = await getToken(env);
  if (!token) return [];
  try {
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      signal: AbortSignal.timeout(5000),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "aiheadroom",
      },
    });
    if (!res.ok) return [];
    const body: unknown = await res.json();
    const limits = parseOauthUsage(body);
    if (limits.length > 0) writeFileSync(file, JSON.stringify(body), { mode: 0o600 });
    return limits;
  } catch {
    return [];
  }
}
