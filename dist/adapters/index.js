import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
                                          

/** Register new adapters here. See docs/ADDING_AN_ADAPTER.md. */
export const adapters                          = {
  [claudeAdapter.id]: claudeAdapter,
  [codexAdapter.id]: codexAdapter,
};
