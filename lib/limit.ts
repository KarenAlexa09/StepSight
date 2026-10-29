const WINDOW_MS = 60_000;
const MAX_REQUESTS = 40;

const hits = new Map<string, number[]>();

// shortcut: per-instance memory, so each serverless instance counts on its own; move to a shared store (Upstash/Redis) for a hard cap.
export function limited(req: Request): Response | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) for (const [key, times] of hits) if (now - times[times.length - 1] > WINDOW_MS) hits.delete(key);
  return recent.length > MAX_REQUESTS ? Response.json({ error: "Too many requests. Give Timber a minute." }, { status: 429 }) : null;
}
