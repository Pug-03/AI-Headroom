import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { codexHome } from "./adapters/codex.js";
import { configPath, loadConfig } from "./core/config.js";

function tryRun(cmd        , args          )                {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

export function doctor()         {
  const mark = (ok         , text        ) => `${ok ? "ok  " : "warn"} ${text}`;
  const codexV = tryRun("codex", ["--version"]);
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  return [
    mark(Number(process.versions.node.split(".")[0]) >= 22, `node ${process.versions.node} (need >= 22.18)`),
    mark(codexV !== null, codexV ? `codex found: ${codexV}` : "codex not found on PATH"),
    mark(existsSync(join(codexHome(), "sessions")), `codex sessions dir: ${join(codexHome(), "sessions")}`),
    mark(existsSync(join(claudeDir, "settings.json")), `claude settings: ${join(claudeDir, "settings.json")}`),
    mark(existsSync(configPath()), `config (optional): ${configPath()}`),
    ...loadConfig().warnings.map((w) => mark(false, `config: ${w}`)),
  ].join("\n");
}
