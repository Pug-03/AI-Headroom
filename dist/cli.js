#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { adapters } from "./adapters/index.js";
import { configPath, defaultConfig, layoutFor, loadConfig,             } from "./core/config.js";
import { layout } from "./core/layout.js";
import { sampleSnapshot } from "./core/sample.js";
                                                   
import { WIDGETS } from "./core/widgets.js";
import { serveStdio } from "./codex/mcp.js";
import { installClaude, installCodex, uninstallClaude, uninstallCodex } from "./install.js";
import { colorEnabled, renderAnsi } from "./render/ansi.js";

const HELP = `AI Headroom (aiheadroom): status line for AI coding CLIs

Usage:
  aiheadroom render --provider <claude|codex> [--columns N] [--oauth-usage]
      Print the status line. Claude Code pipes JSON on stdin.
  aiheadroom watch [--provider codex] [--interval S]
      Redraw the line continuously (for a tmux pane / spare terminal).
  aiheadroom mcp
      Run as a Codex statusline provider (MCP over stdio).
  aiheadroom items                 List widgets you can put in "lines".
  aiheadroom preview [--provider claude|codex] [--columns N]
      Show your current layout with sample data.
  aiheadroom config init           Write a starter config file.
  aiheadroom config path           Print the config file path.
  aiheadroom install [--claude] [--codex] [--wrap | --force] [--dry-run]
      --wrap  keep an existing Claude statusLine command in front (e.g. AFK Pug)
  aiheadroom uninstall [--claude] [--codex] [--dry-run]
  aiheadroom doctor
`;

                
              
                          
                                    
 

function parse(argv          )       {
  const [cmd = "help", ...rest] = argv;
  const flags = new Map                       ();
  let sub                    ;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] ;
    if (!a.startsWith("--")) {
      sub ??= a;
      continue;
    }
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(a.slice(2), next);
      i++;
    } else {
      flags.set(a.slice(2), true);
    }
  }
  return { cmd, sub, flags };
}

async function readStdin()                  {
  if (process.stdin.isTTY) return "";
  let s = "";
  for await (const chunk of process.stdin) s += chunk;
  return s;
}

function columnsOf(flags               )                     {
  const raw = flags.get("columns");
  const n = Number(typeof raw === "string" ? raw : process.env.COLUMNS ?? process.stdout.columns);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function draw(snap          , cfg        , flags               )         {
  const columns = columnsOf(flags);
  const lo = layoutFor(cfg, snap.provider);
  const lines = layout(snap, { ...lo, ...(columns ? { columns } : {}) });
  if (snap.provider === "codex") {
    // Mirror the Codex footer: a single row, lines joined with "·".
    const row = renderAnsi(lines, { color: colorEnabled(), separator: lo.separator }).split("\n");
    return row.join(colorEnabled() ? " \x1b[2m·\x1b[0m " : " · ");
  }
  return renderAnsi(lines, { color: colorEnabled(), separator: lo.separator });
}

async function renderOnce(provider        , flags               , stdin        )                  {
  const adapter = adapters[provider];
  if (!adapter) return `aiheadroom: unknown provider "${provider}"`;
  const cfg = loadConfig();
  if (flags.has("oauth-usage")) cfg.claude.oauthUsage = true;
  const snap = await adapter.read({ stdin, config: cfg, env: process.env });
  if (!snap) return provider === "claude" ? "Claude" : "";
  return draw(snap, cfg, flags);
}

const STARTER = (cfg        ) => ({
  barWidth: cfg.barWidth,
  separator: cfg.separator,
  showResets: cfg.showResets,
  lines: cfg.lines,
  providers: { codex: { lines: cfg.lines } },
  claude: { oauthUsage: false },
});

async function main()                  {
  const { cmd, sub, flags } = parse(process.argv.slice(2));
  const provider = typeof flags.get("provider") === "string" ? (flags.get("provider")          ) : "claude";

  switch (cmd) {
    case "render": {
      const stdin = provider === "claude" ? await readStdin() : "";
      process.stdout.write(`${await renderOnce(provider, flags, stdin)}\n`);
      return 0;
    }
    case "watch": {
      const p = typeof flags.get("provider") === "string" ? provider : "codex";
      const secs = Number(flags.get("interval")) || 2;
      const tick = async () => {
        const out = await renderOnce(p, flags, "");
        process.stdout.write(`\x1b[H\x1b[2J${out}\n`);
      };
      await tick();
      setInterval(() => void tick(), secs * 1000);
      return -1; // keep running
    }
    case "mcp":
      serveStdio();
      return -1;
    case "items": {
      const w = Math.max(...Object.keys(WIDGETS).map((k) => k.length), "text:<words>".length);
      for (const [id, { describe }] of Object.entries(WIDGETS)) console.log(`  ${id.padEnd(w)}  ${describe}`);
      console.log(`  ${"text:<words>".padEnd(w)}  Literal text, e.g. "text:🐶"`);
      return 0;
    }
    case "preview": {
      const cfg = loadConfig();
      for (const warn of cfg.warnings) console.error(`warning: ${warn}`);
      console.log(draw(sampleSnapshot(provider, Math.floor(Date.now() / 1000)), cfg, flags));
      return 0;
    }
    case "config": {
      const path = configPath();
      if (sub === "path") {
        console.log(path);
        return 0;
      }
      if (sub === "init") {
        if (existsSync(path) && !flags.has("force")) {
          console.log(`${path} already exists (use --force to overwrite).`);
          return 1;
        }
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `${JSON.stringify(STARTER(defaultConfig()), null, 2)}\n`);
        console.log(`Wrote ${path}. Edit "lines", then run \`aiheadroom preview\`.`);
        return 0;
      }
      console.log("Usage: aiheadroom config <init|path>");
      return 1;
    }
    case "install":
    case "uninstall": {
      const both = !flags.has("claude") && !flags.has("codex");
      const opts = { force: flags.has("force"), dryRun: flags.has("dry-run"), wrap: flags.has("wrap") };
      const out           = [];
      if (cmd === "install") {
        if (both || flags.has("claude")) out.push(installClaude(opts));
        if (both || flags.has("codex")) out.push(installCodex(opts));
      } else {
        if (both || flags.has("claude")) out.push(uninstallClaude(opts.dryRun));
        if (both || flags.has("codex")) out.push(uninstallCodex());
      }
      console.log(out.join("\n\n"));
      return 0;
    }
    case "doctor": {
      const { doctor } = await import("./doctor.js");
      console.log(doctor());
      return 0;
    }
    default:
      console.log(HELP);
      return cmd === "help" || cmd === "--help" ? 0 : 1;
  }
}

main().then(
  (code) => {
    if (code >= 0) process.exit(code);
  },
  (err         ) => {
    console.error(`aiheadroom: ${(err         ).message}`);
    process.exit(1);
  },
);
