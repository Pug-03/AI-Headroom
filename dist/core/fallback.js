                                                     

/**
 * Fallback policy for limits. An adapter may return a snapshot with no limits
 * (the CLI doesn't expose them). Callers can then plug in a secondary source,
 * e.g. an estimate computed from local session logs. Estimated limits must be
 * tagged `source: "log"` or `"estimate"` so the renderer marks them with "~".
 */
                                                             

export async function withLimitFallback(s          , fallback                )                    {
  if (s.limits.length > 0 || !fallback) return s;
  try {
    return { ...s, limits: await fallback() };
  } catch {
    return s;
  }
}
