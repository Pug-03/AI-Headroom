# Adding an adapter

An adapter turns one CLI's data into a `Snapshot`. The core and renderers never
see anything provider-specific.

```ts
// src/core/snapshot.ts
interface Snapshot {
  provider: string;
  model: string;
  context: { used: number | null; size: number | null };
  limits: { label: string; usedPct: number; resetsAt?: number; source: "stdin" | "api" | "log" | "estimate" }[];
}
```

## Steps

1. Create `src/adapters/<name>.ts` exporting an `Adapter`:

   ```ts
   import type { Adapter } from "./types.ts";

   export const myAdapter: Adapter = {
     id: "mycli",
     async read({ stdin, config, env }) {
       // Parse stdin / read a log / call an API. Return null if there is nothing to show.
       return { provider: "mycli", model: "…", context: { used: null, size: null }, limits: [] };
     },
   };
   ```

2. Register it in `src/adapters/index.ts`.
3. Put a sample of the CLI's real output in `test/fixtures/` (remove personal data) and add a test next to `test/adapters.test.ts`.
4. Wire it into the CLI. Pick whichever the CLI supports:
   - **Runs a command and pipes JSON** (Claude Code): `aiheadroom render --provider mycli`.
   - **Native provider/plugin API** (Codex: MCP): write a small server in `src/<name>/` that builds a `Snapshot`, calls `layout()` and returns the result in the CLI's format (see `src/render/codexTree.ts`).
   - **Neither**: `aiheadroom watch --provider mycli` in a tmux pane or second terminal.

## Rules

- **Never throw** on missing or unexpected fields. Return `null` or leave fields empty.
- **Don't invent numbers.** If the CLI doesn't expose a limit, return no limit. If you estimate one from logs, set `source: "log"` or `"estimate"`; the renderer prefixes `~`.
- **Only read what you need.** Never open credential files. Anything that touches the network or a keychain must be opt-in through `Config` and documented in the README.
- Use `withLimitFallback` (`src/core/fallback.ts`) to chain a secondary limit source behind the primary one.
