import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_LINES } from "./layout.js";
import { isKnownWidget } from "./widgets.js";

/** Settings that can differ per CLI (under `providers.<name>`). */
                               
                                            
                    
                    
                   
                      
 

                         
                   
                    
                      
                    
                                                                                                        
                                                   
           
       
                                                                                       
                                                                             
       
                        
    
                                                                    
                     
 

export const MAX_LINES = 4;
export const MAX_ITEMS_PER_LINE = 12;

export function defaultConfig()         {
  return {
    barWidth: 10,
    separator: "|",
    showResets: true,
    lines: DEFAULT_LINES.map((l) => [...l]),
    providers: {},
    claude: { oauthUsage: false },
    warnings: [],
  };
}

export const APP = "aiheadroom";
/** Name used before the rename to AI Headroom; still read so old setups keep working. */
export const LEGACY_APP = "termbar";

const configRoot = (env                   ) => env.XDG_CONFIG_HOME || join(homedir(), ".config");

export function configDir(env                    = process.env)         {
  return join(configRoot(env), APP);
}

export function legacyConfigDir(env                    = process.env)         {
  return join(configRoot(env), LEGACY_APP);
}

/** The config file to read: the new location, or the legacy one if only that exists. */
export function configPath(env                    = process.env)         {
  const current = join(configDir(env), "config.json");
  const legacy = join(legacyConfigDir(env), "config.json");
  return !existsSync(current) && existsSync(legacy) ? legacy : current;
}

/** Read an env var under the new prefix, falling back to the legacy TERMBAR_ prefix. */
export function envFlag(env                   , name        )                     {
  return env[`AIHEADROOM_${name}`] ?? env[`TERMBAR_${name}`];
}

/** Validate a `lines` value. Returns null (and records a warning) when unusable. */
function parseLines(v         , where        , warnings          )                    {
  if (v === undefined) return null;
  if (!Array.isArray(v) || v.length === 0 || !v.every((l) => Array.isArray(l) && l.every((x) => typeof x === "string"))) {
    warnings.push(`${where}: must be a non-empty array of arrays of widget ids`);
    return null;
  }
  const lines = (v              ).slice(0, MAX_LINES).map((l) => l.slice(0, MAX_ITEMS_PER_LINE));
  for (const id of lines.flat()) {
    if (!isKnownWidget(id)) warnings.push(`${where}: unknown widget "${id}" (see \`aiheadroom items\`)`);
  }
  if (v.length > MAX_LINES) warnings.push(`${where}: only the first ${MAX_LINES} lines are used`);
  return lines;
}

/** Read the per-CLI layout fields of one object; only valid fields are returned. */
function parseLayout(o                     , where        , warnings          )                        {
  const out                        = {};
  if (o.barWidth !== undefined) {
    if (Number.isInteger(o.barWidth) && o.barWidth >= 0 && o.barWidth <= 40) out.barWidth = o.barWidth;
    else warnings.push(`${where}barWidth: must be an integer 0-40`);
  }
  if (o.separator !== undefined) {
    if (typeof o.separator === "string" && [...o.separator].length <= 3) out.separator = o.separator;
    else warnings.push(`${where}separator: must be a string of at most 3 characters`);
  }
  if (o.showResets !== undefined) {
    if (typeof o.showResets === "boolean") out.showResets = o.showResets;
    else warnings.push(`${where}showResets: must be true or false`);
  }
  const lines = parseLines(o.lines, `${where}lines`, warnings);
  if (lines) out.lines = lines;
  return out;
}

/** Load `<config dir>/config.json` merged over defaults. Bad values fall back to defaults. */
export function loadConfig(env                    = process.env)         {
  const cfg = defaultConfig();
  let user                      = {};
  try {
    const parsed          = JSON.parse(readFileSync(configPath(env), "utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) user = parsed                       ;
    else cfg.warnings.push("config.json must contain a JSON object");
  } catch (e) {
    if ((e                         ).code !== "ENOENT") cfg.warnings.push(`config.json: ${(e         ).message}`);
  }

  const top = parseLayout(user, "", cfg.warnings);
  Object.assign(cfg, top);

  if (typeof user.providers === "object" && user.providers !== null) {
    for (const [name, p] of Object.entries(user.providers                       )) {
      if (typeof p !== "object" || p === null) continue;
      const o = parseLayout(p, `providers.${name}.`, cfg.warnings);
      if (Object.keys(o).length > 0) cfg.providers[name] = o;
    }
  }
  cfg.claude.oauthUsage = user.claude?.oauthUsage === true || envFlag(env, "CLAUDE_OAUTH") === "1";
  return cfg;
}

export function linesFor(cfg        , provider        )             {
  return cfg.providers[provider]?.lines ?? cfg.lines;
}

/** Effective layout for one CLI: provider overrides on top of the global values. */
export function layoutFor(cfg        , provider        )               {
  const p = cfg.providers[provider] ?? {};
  return {
    lines: p.lines ?? cfg.lines,
    separator: p.separator ?? cfg.separator,
    barWidth: p.barWidth ?? cfg.barWidth,
    showResets: p.showResets ?? cfg.showResets,
  };
}
