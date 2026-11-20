import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bar } from "../src/core/bar.ts";
import { layoutFor, linesFor, loadConfig } from "../src/core/config.ts";
import { layout } from "../src/core/layout.ts";
import type { Snapshot } from "../src/core/snapshot.ts";
import { levelStyle, lineWidth } from "../src/core/style.ts";
import { renderAnsi } from "../src/render/ansi.ts";
import { renderCodexTree, type CodexElement } from "../src/render/codexTree.ts";

const NOW = 1_000_000;
const snap: Snapshot = {
  provider: "t",
  model: "Model X",
  context: { used: 500_000, size: 1_000_000 },
  limits: [
    { id: "5h", label: "5h", usedPct: 75, resetsAt: NOW + 100, source: "stdin" },
    { id: "weekly", label: "Weekly", usedPct: 95, resetsAt: NOW + 200_000, source: "log" },
  ],
  cwd: "/a/b/project",
};
const plain = (o: Parameters<typeof layout>[1] = {}) =>
  renderAnsi(layout(snap, { now: NOW, ...o }), { color: false, separator: o.separator ?? "|" });

test("level thresholds: green <70, orange >=70, red >=90", () => {
  assert.equal(levelStyle(69), "ok");
  assert.equal(levelStyle(70), "warn");
  assert.equal(levelStyle(89), "warn");
  assert.equal(levelStyle(90), "crit");
});

test("bar has fixed width and clamps", () => {
  for (const p of [-5, 0, 33, 100, 250]) {
    assert.equal(bar(p, 10).reduce((n, s) => n + s.text.length, 0), 10);
  }
  assert.deepEqual(bar(50, 0), []);
});

test("default layout: two lines, model/context on top, limits below; log source marked ~", () => {
  const out = plain().split("\n");
  assert.equal(out.length, 2);
  assert.match(out[0]!, /^Model X \| [█░]{10} 50% \| 500k\/1\.0m$/);
  assert.match(out[1]!, /^5h [█░]{10} 75% \S.* \| Weekly [█░]{10} ~95% /);
});

test("custom lines, order and literal text", () => {
  const out = plain({ lines: [["limit-weekly"], ["text:hi", "model", "cwd", "remaining"]] }).split("\n");
  assert.equal(out.length, 2);
  assert.match(out[0]!, /^Weekly /);
  assert.equal(out[1], "hi | Model X | project | 500k left");
});

test("missing data drops widgets and empty lines", () => {
  const bare: Snapshot = { provider: "t", model: "M", context: { used: null, size: null }, limits: [] };
  assert.equal(renderAnsi(layout(bare), { color: false }), "M");
});

test("separator and showResets options", () => {
  const out = plain({ lines: [["model", "limit-5h"]], separator: "·", showResets: false });
  assert.match(out, /^Model X · 5h [█░]{10} 75%$/);
});

test("NO_COLOR output has no escapes and a distinguishable track", () => {
  const out = plain();
  assert.doesNotMatch(out, /\x1b\[/);
  assert.match(out, /░/);
});

test("color output uses truecolor orange and red", () => {
  const out = renderAnsi(layout(snap, { now: NOW }), { color: true });
  assert.match(out, /\x1b\[38;2;221;129;97m/);
  assert.match(out, /\x1b\[38;2;226;84;84m/);
});

test("layout never exceeds the column budget", () => {
  for (const cols of [120, 60, 40, 30, 20, 10, 3]) {
    for (const line of layout(snap, { columns: cols, now: NOW })) {
      assert.ok(lineWidth(line) <= cols, `width ${lineWidth(line)} > ${cols}`);
    }
  }
});

/* ---------- Codex tree ---------- */

function leaves(e: CodexElement): string[] {
  return typeof e === "string" ? [e] : e.children.flatMap(leaves);
}

test("codex tree: no whitespace or control characters in text leaves", () => {
  const tree = renderCodexTree(layout(snap, { now: NOW }))!;
  for (const leaf of leaves(tree)) {
    assert.equal(leaf, leaf.trim(), `leaf "${leaf}" has edge whitespace`);
    assert.doesNotMatch(leaf, /[\u0000-\u001f\u007f]/, `leaf ${JSON.stringify(leaf)} has a control character`);
  }
});

test("codex tree: lines joined in one row with a · node; rows use gap for spacing", () => {
  const tree = renderCodexTree(layout(snap, { now: NOW }))!;
  assert.ok(typeof tree !== "string" && tree.type === "row");
  assert.equal(tree.props.gap, 1);
  assert.equal(tree.children.length, 3);
  const mid = tree.children[1]!;
  assert.ok(typeof mid !== "string" && mid.type === "text" && mid.children[0] === "·");
  assert.match(JSON.stringify(tree), /"color":"#dd8161"/);
  assert.equal(renderCodexTree([]), null);
});

/* ---------- Config ---------- */

function withConfig(json: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "aih-cfg-"));
  mkdirSync(join(dir, "aiheadroom"));
  writeFileSync(join(dir, "aiheadroom", "config.json"), typeof json === "string" ? json : JSON.stringify(json));
  return loadConfig({ XDG_CONFIG_HOME: dir });
}

test("config: lines, per-provider override, options", () => {
  const cfg = withConfig({
    lines: [["model"]],
    providers: { codex: { lines: [["limits"], ["model"]] } },
    separator: "·",
    showResets: false,
  });
  assert.deepEqual(linesFor(cfg, "claude"), [["model"]]);
  assert.deepEqual(linesFor(cfg, "codex"), [["limits"], ["model"]]);
  assert.equal(cfg.separator, "·");
  assert.equal(cfg.showResets, false);
  assert.deepEqual(cfg.warnings, []);
});

test("config: bad values fall back to defaults with warnings", () => {
  const cfg = withConfig({ lines: "model", barWidth: 99, providers: { codex: { lines: [["nope"]] } } });
  assert.equal(cfg.barWidth, 10);
  assert.equal(cfg.lines.length, 2);
  assert.ok(cfg.warnings.some((w) => w.startsWith("lines:")));
  assert.ok(cfg.warnings.some((w) => w.includes('unknown widget "nope"')));
  assert.ok(withConfig("{ broken").warnings.length > 0);
});

test("config: missing file is fine; oauth stays off by default", () => {
  const cfg = loadConfig({ XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), "aih-none-")) });
  assert.deepEqual(cfg.warnings, []);
  assert.equal(cfg.claude.oauthUsage, false);
});

test("config: per-provider separator, barWidth and showResets override the globals", () => {
  const cfg = withConfig({
    separator: "|",
    providers: { codex: { lines: [["model", "limits"]], separator: "·", barWidth: 6, showResets: false } },
  });
  assert.deepEqual(layoutFor(cfg, "codex"), { lines: [["model", "limits"]], separator: "·", barWidth: 6, showResets: false });
  const claude = layoutFor(cfg, "claude");
  assert.equal(claude.separator, "|");
  assert.equal(claude.barWidth, 10);
  assert.equal(claude.showResets, true);
  assert.deepEqual(cfg.warnings, []);
  const bad = withConfig({ providers: { codex: { barWidth: -1, showResets: "no" } } });
  assert.ok(bad.warnings.some((w) => w.startsWith("providers.codex.barWidth")));
  assert.ok(bad.warnings.some((w) => w.startsWith("providers.codex.showResets")));
});

test("config: falls back to the pre-rename ~/.config/termbar file; new file wins when both exist", () => {
  const dir = mkdtempSync(join(tmpdir(), "aih-legacy-"));
  mkdirSync(join(dir, "termbar"));
  writeFileSync(join(dir, "termbar", "config.json"), JSON.stringify({ separator: "/" }));
  assert.equal(loadConfig({ XDG_CONFIG_HOME: dir }).separator, "/");
  mkdirSync(join(dir, "aiheadroom"));
  writeFileSync(join(dir, "aiheadroom", "config.json"), JSON.stringify({ separator: "·" }));
  assert.equal(loadConfig({ XDG_CONFIG_HOME: dir }).separator, "·");
});

test("env: AIHEADROOM_ flags, with legacy TERMBAR_ still honored", () => {
  const d = mkdtempSync(join(tmpdir(), "aih-env-"));
  assert.equal(loadConfig({ XDG_CONFIG_HOME: d, AIHEADROOM_CLAUDE_OAUTH: "1" }).claude.oauthUsage, true);
  assert.equal(loadConfig({ XDG_CONFIG_HOME: d, TERMBAR_CLAUDE_OAUTH: "1" }).claude.oauthUsage, true);
});
