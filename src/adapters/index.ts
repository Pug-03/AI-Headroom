import { claudeAdapter } from "./claude.ts";
import { codexAdapter } from "./codex.ts";
import type { Adapter } from "./types.ts";

/** Register new adapters here. See docs/ADDING_AN_ADAPTER.md. */
export const adapters: Record<string, Adapter> = {
  [claudeAdapter.id]: claudeAdapter,
  [codexAdapter.id]: codexAdapter,
};
