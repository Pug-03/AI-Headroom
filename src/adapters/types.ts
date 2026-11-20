import type { Config } from "../core/config.ts";
import type { Snapshot } from "../core/snapshot.ts";

export interface AdapterContext {
  /** Raw stdin, if the CLI pipes data to us (Claude Code does). */
  stdin: string;
  config: Config;
  env: NodeJS.ProcessEnv;
}

/**
 * An adapter turns one CLI's data into a Snapshot. It must never throw for
 * missing or odd data: return null when there is nothing to show.
 */
export interface Adapter {
  id: string;
  read(ctx: AdapterContext): Promise<Snapshot | null>;
}
