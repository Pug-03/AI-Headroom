import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { codexHome } from "./adapters/codex.ts";
import { configPath, loadConfig } from "./core/config.ts";

function tryRun(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

export function doctor(): string {
  const mark = (ok: boolean, text: string) => `${ok ? "ok  " : "warn"} ${text}`;
  const codexV = tryRun("codex", ["--version"]);
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  return [
    mark(Number(process.versions.node.split(".")[0]) >= 22, `node ${process.versions.node} (need >= 22.18)`),
    mark(codexV !== null, codexV ? `codex found: ${codexV}` : "codex not found on PATH"),
    mark(existsSync(join(codexHome(), "sessions")), `codex sessions dir: ${join(codexHome(), "sessions")}`),
    mark(existsSync(join(claudeDir, "settings.json")), `claude settings: ${join(claudeDir, "settings.json")}`),
    mark(existsSync(configPath()), `termbar config (optional): ${configPath()}`),
    ...loadConfig().warnings.map((w) => mark(false, `config: ${w}`)),
  ].join("\n");
}
