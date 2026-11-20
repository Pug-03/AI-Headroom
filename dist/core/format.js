export function formatTokens(n        )         {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.max(0, Math.round(n)));
}

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/**
 * Format a reset time (unix seconds). Within 24h: "3:05 PM".
 * Further out: "Nov 28, 3:05 PM". `now` is unix seconds.
 */
export function formatReset(resetsAt        , now        )         {
  const d = new Date(resetsAt * 1000);
  const time = timeFmt.format(d);
  return resetsAt - now < 86_400 ? time : `${dateFmt.format(d)}, ${time}`;
}
