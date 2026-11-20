import { PALETTE, type Line, type Rgb, type Segment, type StyleName } from "../core/style.ts";

const RESET = "\x1b[0m";

function open(style: StyleName): string {
  if (style === "dim") return "\x1b[2m";
  const c: Rgb | null = PALETTE[style];
  return c ? `\x1b[38;2;${c.r};${c.g};${c.b}m` : "";
}

export interface AnsiOptions {
  color: boolean;
  separator?: string;
}

/** Whether to emit color. Honors https://no-color.org and TERMBAR_COLOR=0. */
export function colorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.TERMBAR_COLOR === "0") return false;
  return true;
}

/** Render lines to a string. Without color the empty bar track uses "░" so it stays visible. */
export function renderAnsi(lines: Line[], { color, separator = "|" }: AnsiOptions): string {
  const seg = (s: Segment) => {
    if (!color) return s.style === "track" ? s.text.replaceAll("█", "░") : s.text;
    const o = open(s.style);
    return o ? `${o}${s.text}${RESET}` : s.text;
  };
  const sep = separator === "" ? " " : ` ${color ? `${open("dim")}${separator}${RESET}` : separator} `;
  return lines
    .map((line) => line.map((item) => item.map((part) => part.map(seg).join("")).join(" ")).join(sep))
    .join("\n");
}
