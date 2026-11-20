import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP, configDir, LEGACY_APP, legacyConfigDir } from "./core/config.ts";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "cli.js");

export interface InstallOptions {
  force: boolean;
  dryRun: boolean;
  /** Keep the existing statusLine command in front and run AI Headroom as the renderer. */
  wrap: boolean;
}

function claudeSettingsPath(env = process.env): string {
  return join(env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "settings.json");
}

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

const quote = (s: string) => `"${s.replaceAll('"', '\\"')}"`;
const shSingle = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

export const claudeRenderCommand = (cli = CLI) => `node ${quote(cli)} render --provider claude`;

/** True for a statusLine command we installed, including ones from before the rename. */
const isOurCommand = (cmd: unknown): boolean =>
  typeof cmd === "string" && (cmd.includes(CLI) || cmd.includes(APP) || cmd.includes(LEGACY_APP));

/**
 * Wrap an existing statusLine command so it still receives stdin (and keeps
 * updating its own state) while AI Headroom draws the line.
 *
 * - AFK Pug form `if [ -x 'P' ]; then 'P' '<inner>'; else <inner>; fi`:
 *   only `<inner>` is swapped for our command, so AFK Pug stays in front.
 * - Any other command: run it with a copy of stdin and discard its output,
 *   then run ours with the same stdin.
 */
export function buildWrapped(original: string, tb: string): string {
  const m = /^if \[ -x '([^']+)' \]; then '\1' '(?:[^']|'\\'')*'; else .*; fi$/s.exec(original.trim());
  if (m && m[1]!.endsWith("afkpug-statusline")) {
    const p = shSingle(m[1]!).slice(1, -1);
    return `if [ -x '${p}' ]; then '${p}' ${shSingle(tb)}; else ${tb}; fi`;
  }
  return `_tb_in=$(cat); printf '%s' "$_tb_in" | { ${original}; } >/dev/null 2>&1; printf '%s' "$_tb_in" | ${tb}`;
}

const stamp = () => Math.floor(Date.now() / 1000);

function backup(path: string): string | null {
  if (!existsSync(path)) return null;
  const dest = `${path}.${APP}-backup-${stamp()}`;
  copyFileSync(path, dest);
  return dest;
}

const PREV = "previous-claude-statusline.json";
const previousFile = () => join(configDir(), PREV);
/** Saved original command: new location first, then the pre-rename one. */
const savedPrevious = (): string | null =>
  [previousFile(), join(legacyConfigDir(), PREV)].find((p) => existsSync(p)) ?? null;

export function installClaude({ force, dryRun, wrap }: InstallOptions): string {
  const path = claudeSettingsPath();
  const settings = readJson(path);
  const existing = settings.statusLine as { type?: string; command?: string } | undefined;
  const tb = claudeRenderCommand();

  if (existing && isOurCommand(existing.command)) {
    return `Claude Code: AI Headroom is already installed in ${path}. Run \`aiheadroom uninstall --claude\` first to change modes.`;
  }
  if (existing && !force && !wrap) {
    return `Claude Code already has a statusLine configured in ${path}:\n  ${existing.command}\nRe-run with --wrap to keep it in front of AI Headroom, or --force to replace it.`;
  }
  const command = existing && wrap && typeof existing.command === "string" ? buildWrapped(existing.command, tb) : tb;
  const mode = existing && wrap ? "wrap" : "set";

  if (dryRun) {
    return `[dry-run] would ${mode} statusLine.command in ${path}\n  from: ${existing?.command ?? "(none)"}\n  to:   ${command}`;
  }
  const bak = backup(path);
  if (existing) {
    mkdirSync(configDir(), { recursive: true });
    writeFileSync(previousFile(), JSON.stringify(existing));
  }
  settings.statusLine = { type: "command", command };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  return `Claude Code: statusLine ${mode === "wrap" ? "wrapped" : "set"} in ${path}${bak ? ` (backup: ${bak})` : ""}.`;
}

export function uninstallClaude(dryRun = false): string {
  const path = claudeSettingsPath();
  const settings = readJson(path);
  const cur = settings.statusLine as { command?: string } | undefined;
  if (!cur || !isOurCommand(cur.command)) return "Claude Code: no AI Headroom statusLine found.";
  const prev = savedPrevious();
  const restored = prev ? (JSON.parse(readFileSync(prev, "utf8")) as unknown) : undefined;
  if (dryRun) {
    return `[dry-run] would ${restored ? "restore the previous statusLine" : "remove statusLine"} in ${path}`;
  }
  const bak = backup(path);
  if (restored) settings.statusLine = restored;
  else delete settings.statusLine;
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  if (prev) rmSync(prev);
  return `Claude Code: AI Headroom removed, ${restored ? "previous statusLine restored" : "statusLine deleted"}${bak ? ` (backup: ${bak})` : ""}.`;
}

const codexArgs = ["mcp", "add", APP, "--", "node", CLI, "mcp"];

export function installCodex({ dryRun }: InstallOptions): string {
  const cmd = `codex ${codexArgs.map((a) => (a.includes(" ") ? quote(a) : a)).join(" ")}`;
  const next =
    "Then in Codex: enable **Custom status line** in /experimental, restart the TUI,\n" +
    "open /statusline, choose \"Choose a status line provider\", and select AI Headroom.";
  if (dryRun) return `[dry-run] would run: ${cmd}\n${next}`;
  try {
    execFileSync("codex", codexArgs, { stdio: "pipe" });
  } catch (e) {
    return `Codex: could not run \`codex mcp add\` (${(e as Error).message.split("\n")[0]}).\nRun it yourself:\n  ${cmd}\n${next}`;
  }
  return `Codex: MCP provider "${APP}" registered.\n${next}`;
}

/** Removes the provider under its current name and its pre-rename name. */
export function uninstallCodex(): string {
  const removed: string[] = [];
  for (const name of [APP, LEGACY_APP]) {
    try {
      // `codex mcp remove` exits 0 even for unknown names, so check first.
      execFileSync("codex", ["mcp", "get", name], { stdio: "pipe" });
      execFileSync("codex", ["mcp", "remove", name], { stdio: "pipe" });
      removed.push(name);
    } catch {
      // not registered under this name
    }
  }
  return removed.length > 0
    ? `Codex: MCP provider ${removed.map((n) => `"${n}"`).join(" and ")} removed.`
    : `Codex: nothing removed (run \`codex mcp remove ${APP}\` manually if needed).`;
}
