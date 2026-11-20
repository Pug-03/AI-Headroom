import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseClaudeStdin } from "../src/adapters/claude.ts";
import { fromStatuslineState, parseRollout, windowLabel } from "../src/adapters/codex.ts";
import { handleRequest, URI } from "../src/codex/mcp.ts";

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

test("claude: parses model, context, rate limits from stdin", () => {
  const s = parseClaudeStdin(fx("claude-stdin.json"))!;
  assert.equal(s.model, "Sonnet 5.5");
  assert.deepEqual(s.context, { used: 701_200, size: 1_000_000 });
  assert.deepEqual(s.limits.map((l) => [l.id, l.label, l.usedPct, l.source]), [
    ["5h", "5h", 40, "stdin"],
    ["weekly", "Weekly", 92, "stdin"],
  ]);
});

test("claude: bad or empty stdin yields null, missing fields are tolerated", () => {
  assert.equal(parseClaudeStdin(""), null);
  assert.equal(parseClaudeStdin("not json"), null);
  const s = parseClaudeStdin("{}")!;
  assert.equal(s.model, "Claude");
  assert.equal(s.limits.length, 0);
});

test("codex: native statusline state", () => {
  const s = fromStatuslineState(JSON.parse(fx("codex-statusline-state.json")))!;
  assert.equal(s.model, "gpt-6-sol medium");
  assert.deepEqual(s.context, { used: 100_000, size: 400_000 });
  assert.deepEqual(s.limits.map((l) => l.id), ["5h", "weekly"]);
  assert.equal(s.cwd, "/tmp/x");
});

test("codex: rollout parsing uses latest token_count with limits", () => {
  const s = parseRollout(fx("codex-rollout.jsonl"));
  assert.equal(s.model, "gpt-6-sol");
  assert.deepEqual(s.context, { used: 60_000, size: 200_000 });
  assert.equal(s.limits.length, 2);
  assert.equal(s.limits[0]!.source, "log");
});

test("codex: rollout with null rate_limits gives no limits (no invented numbers)", () => {
  const first = fx("codex-rollout.jsonl").split("\n").slice(0, 3).join("\n");
  assert.deepEqual(parseRollout(first).limits, []);
});

test("windowLabel", () => {
  assert.equal(windowLabel(300), "5h");
  assert.equal(windowLabel(10080), "Weekly");
  assert.equal(windowLabel(null), "Limit");
  assert.equal(windowLabel(45), "45m");
});

test("mcp: tool advertises a statusline entrypoint and resources/read returns a tree", () => {
  const tools = handleRequest("tools/list") as { tools: Array<{ _meta: any }> };
  assert.equal(tools.tools.length, 1);
  assert.deepEqual(tools.tools[0]!._meta["openai/ui"].entrypoints, [{ type: "statusline", resourceUri: URI }]);

  const res = handleRequest("resources/read", {
    uri: URI,
    _meta: { "com.openai/codex-statusline-state": JSON.parse(fx("codex-statusline-state.json")) },
  }) as { contents: Array<{ text: string; mimeType: string }> };
  assert.equal(res.contents[0]!.mimeType, "application/json");
  const tree = JSON.parse(res.contents[0]!.text);
  assert.equal(tree.type, "row");
  assert.match(res.contents[0]!.text, /gpt-6-sol medium/);
  assert.ok(Buffer.byteLength(res.contents[0]!.text) < 64 * 1024);
});

test("mcp: unknown method and uri are rejected", () => {
  assert.throws(() => handleRequest("nope"));
  assert.throws(() => handleRequest("resources/read", { uri: "ui://other" }));
});

test("security: source never references Codex auth.json", () => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((n) => {
      const p = join(d, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const src = new URL("../src", import.meta.url).pathname;
  for (const f of walk(src)) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /auth\.json/, `${f} mentions auth.json`);
  }
});
