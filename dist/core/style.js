/** Semantic styles. Renderers decide how each one is drawn. */
                                                                          

/** A run of text in one style. */
                          
               
                   
 

/**
 * Layout tree. Renderers decide the spacing:
 * - Segments inside a Part are glued together (e.g. the filled and empty halves of a bar).
 * - Parts inside an Item are separated by one space.
 * - Items inside a Line are separated by the configured separator ("|" by default).
 *
 * Spacing is structural, not embedded in text, because Codex trims whitespace
 * inside footer text nodes.
 */
                             
                          
                          

/** Thresholds from the project spec: orange from 70%, red from 90%. */
export const WARN_AT = 70;
export const CRIT_AT = 90;

                      
            
            
            
 

/** Truecolor palette. `null` means "terminal default". */
export const PALETTE                                = {
  text: { r: 220, g: 220, b: 220 },
  dim: null,
  ok: { r: 127, g: 179, b: 138 },
  warn: { r: 221, g: 129, b: 97 },
  crit: { r: 226, g: 84, b: 84 },
  track: { r: 80, g: 60, b: 50 },
};

export function levelStyle(pct        )                         {
  if (pct >= CRIT_AT) return "crit";
  if (pct >= WARN_AT) return "warn";
  return "ok";
}

export function rgbHex({ r, g, b }     )         {
  const h = (n        ) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/* Widths are in code points; East Asian wide characters are not accounted for. */

const len = (s        ) => [...s].length;

export function partWidth(p      )         {
  return p.reduce((n, s) => n + len(s.text), 0);
}

export function itemWidth(it      )         {
  return it.reduce((n, p) => n + partWidth(p), 0) + Math.max(0, it.length - 1);
}

/** Columns used between two items for a given separator. */
export function sepWidth(separator        )         {
  return separator === "" ? 1 : len(separator) + 2;
}

export function lineWidth(line      , separator = "|")         {
  return line.reduce((n, it) => n + itemWidth(it), 0) + Math.max(0, line.length - 1) * sepWidth(separator);
}

/** Flatten an item into one part (parts joined by spaces) and cut it to `max` columns with "…". */
export function truncateItem(it      , max        )       {
  if (max <= 0) return [];
  if (itemWidth(it) <= max) return it;
  const flat            = [];
  it.forEach((p, i) => {
    if (i > 0) flat.push({ text: " ", style: "text" });
    flat.push(...p);
  });
  const out            = [];
  let left = max - 1;
  for (const seg of flat) {
    const chars = [...seg.text];
    if (chars.length <= left) {
      out.push(seg);
      left -= chars.length;
    } else {
      if (left > 0) out.push({ text: chars.slice(0, left).join(""), style: seg.style });
      break;
    }
  }
  out.push({ text: "…", style: "dim" });
  return [out];
}
