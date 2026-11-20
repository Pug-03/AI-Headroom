import { envFlag } from "../core/config.js";
import { PALETTE,                                                   } from "../core/style.js";

const RESET = "\x1b[0m";

function open(style           )         {
  if (style === "dim") return "\x1b[2m";
  const c             = PALETTE[style];
  return c ? `\x1b[38;2;${c.r};${c.g};${c.b}m` : "";
}

                              
                 
                     
 

/** Whether to emit color. Honors https://no-color.org and AIHEADROOM_COLOR=0. */
export function colorEnabled(env                    = process.env)          {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (envFlag(env, "COLOR") === "0") return false;
  return true;
}

/** Render lines to a string. Without color the empty bar track uses "░" so it stays visible. */
export function renderAnsi(lines        , { color, separator = "|" }             )         {
  const seg = (s         ) => {
    if (!color) return s.style === "track" ? s.text.replaceAll("█", "░") : s.text;
    const o = open(s.style);
    return o ? `${o}${s.text}${RESET}` : s.text;
  };
  const sep = separator === "" ? " " : ` ${color ? `${open("dim")}${separator}${RESET}` : separator} `;
  return lines
    .map((line) => line.map((item) => item.map((part) => part.map(seg).join("")).join(" ")).join(sep))
    .join("\n");
}
