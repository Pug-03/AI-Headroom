import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildWrapped, installClaude, uninstallClaude } from "../src/install.ts";

const AFK =
  "if [ -x '/Users/me/.afkpug/bin/afkpug-statusline' ]; then '/Users/me/.afkpug/bin/afkpug-statusline' 'bash ~/.claude/statusline.sh'; else bash ~/.claude/statusline.sh; fi";
const TB = 'node "/opt/aiheadroom/dist/cli.js" render --provider claude';

/** Point installer config and Claude settings at a temp dir. */
function sandbox(statusLine?: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "aih-inst-"));
  process.env.CLAUDE_CONFIG_DIR = join(dir, "claude");
  process.env.XDG_CONFIG_HOME = join(dir, "xdg");
  const file = join(dir, "claude", "settings.json");
  if (statusLine !== undefined) {
    execFileSync("mkdir", ["-p", join(dir, "claude")]);
    writeFileSync(file, JSON.stringify({ model: "sonnet", statusLine }));
  }
  const read = () => JSON.parse(readFileSync(file, "utf8")) as { model?: string; statusLine?: { command: string } };
  return { dir, file, read };
}
const opts = (o: Partial<{ force: boolean; dryRun: boolean; wrap: boolean }> = {}) => ({
  force: false,
  dryRun: false,
  wrap: false,
  ...o,
});

test("buildWrapped: AFK Pug stays in front and only the inner command is replaced", () => {
  const out = buildWrapped(AFK, TB);
  assert.equal(
    out,
    `if [ -x '/Users/me/.afkpug/bin/afkpug-statusline' ]; then '/Users/me/.afkpug/bin/afkpug-statusline' '${TB}'; else ${TB}; fi`,
  );
  assert.ok(out.indexOf("afkpug-statusline") < out.indexOf("aiheadroom"));
  assert.doesNotMatch(out, /statusline\.sh/);
});

test("buildWrapped: generic command keeps its side effects, ours draws", () => {
  const dir = mkdtempSync(join(tmpdir(), "aih-gen-"));
  const marker = join(dir, "seen");
  const orig = `cat > ${marker}; echo ORIGINAL-OUTPUT`;
  const cmd = buildWrapped(orig, "echo TERMBAR-OUTPUT");
  const out = execFileSync("sh", ["-c", cmd], { input: '{"a":1}', encoding: "utf8" });
  assert.equal(out.trim(), "TERMBAR-OUTPUT");
  assert.equal(readFileSync(marker, "utf8"), '{"a":1}');
});

test("install --wrap: AFK Pug command is wrapped, backed up, and settings preserved", () => {
  const sb = sandbox({ type: "command", command: AFK });
  const msg = installClaude(opts({ wrap: true }));
  assert.match(msg, /wrapped/);
  const s = sb.read();
  assert.equal(s.model, "sonnet");
  assert.match(s.statusLine!.command, /^if \[ -x '.*afkpug-statusline' \]; then '.*afkpug-statusline' '.*render --provider claude'/);
  assert.ok(readdirSync(join(sb.dir, "claude")).some((f) => f.startsWith("settings.json.aiheadroom-backup-")));
});

test("install --wrap --dry-run changes nothing and shows from/to", () => {
  const sb = sandbox({ type: "command", command: AFK });
  const before = readFileSync(sb.file, "utf8");
  const msg = installClaude(opts({ wrap: true, dryRun: true }));
  assert.match(msg, /\[dry-run\][\s\S]*from: if \[ -x[\s\S]*to: {3}if \[ -x/);
  assert.equal(readFileSync(sb.file, "utf8"), before);
  assert.deepEqual(readdirSync(join(sb.dir, "claude")), ["settings.json"]);
});

test("install without --wrap/--force refuses when a statusLine exists", () => {
  const sb = sandbox({ type: "command", command: AFK });
  const before = readFileSync(sb.file, "utf8");
  assert.match(installClaude(opts()), /--wrap/);
  assert.equal(readFileSync(sb.file, "utf8"), before);
});

test("install twice does not double-wrap", () => {
  const sb = sandbox({ type: "command", command: AFK });
  installClaude(opts({ wrap: true }));
  const once = readFileSync(sb.file, "utf8");
  assert.match(installClaude(opts({ wrap: true })), /already installed/);
  assert.equal(readFileSync(sb.file, "utf8"), once);
});

test("uninstall restores the exact original command and backs up first", () => {
  const sb = sandbox({ type: "command", command: AFK });
  installClaude(opts({ wrap: true }));
  const msg = uninstallClaude();
  assert.match(msg, /previous statusLine restored/);
  assert.deepEqual(sb.read().statusLine, { type: "command", command: AFK });
  assert.equal(sb.read().model, "sonnet");
  const backups = readdirSync(join(sb.dir, "claude")).filter((f) => f.includes("aiheadroom-backup"));
  assert.ok(backups.length >= 1);
});

test("uninstall with no previous statusLine deletes it; no-op when not installed", () => {
  const sb = sandbox();
  installClaude(opts());
  assert.ok(sb.read().statusLine);
  uninstallClaude();
  assert.equal(sb.read().statusLine, undefined);
  assert.match(uninstallClaude(), /no AI Headroom statusLine/);

  const sb2 = sandbox({ type: "command", command: "echo hi" });
  assert.match(uninstallClaude(), /no AI Headroom statusLine/);
  assert.equal(sb2.read().statusLine!.command, "echo hi");
  assert.ok(existsSync(sb2.file));
});

test("pre-rename installs: old command is recognized and uninstall restores from the old folder", () => {
  const sb = sandbox({ type: "command", command: 'node "/x/termbar/dist/cli.js" render --provider claude' });
  // The original command was saved under ~/.config/termbar before the rename.
  mkdirSync(join(sb.dir, "xdg", "termbar"), { recursive: true });
  writeFileSync(join(sb.dir, "xdg", "termbar", "previous-claude-statusline.json"), JSON.stringify({ type: "command", command: AFK }));
  assert.match(installClaude(opts({ wrap: true })), /already installed/);
  assert.match(uninstallClaude(), /previous statusLine restored/);
  assert.deepEqual(sb.read().statusLine, { type: "command", command: AFK });
  assert.ok(!existsSync(join(sb.dir, "xdg", "termbar", "previous-claude-statusline.json")));
});
