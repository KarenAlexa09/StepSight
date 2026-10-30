export type Intent = { text?: string; image?: string };

const KEY = "stepsight.intent";

export function sendIntent(intent: Intent) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(intent));
  } catch {}
}

export function takeIntent(): Intent | null {
  try {
    const saved = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}
