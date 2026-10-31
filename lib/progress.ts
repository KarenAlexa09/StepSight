import { MANUAL_KEY, type Manual } from "./manual";

const PROGRESS_KEY = "stepsight.progress";
const BUILDS_KEY = "stepsight.builds";

export type Progress = {
  step: number;
  xp: number;
  stars: number;
  streak: number;
  mistakes: number;
  triedThisStep: boolean;
  prepDone?: boolean;
  startedAt: number;
  finishedAt: number | null;
  activeMs?: number;
  lastAt?: number;
};

export type Build = { title: string; finishedAt: number; minutes: number; steps: number; stars: number; mistakes: number; mode?: "build" | "fix"; photo?: string };

export const XP_STEP = 25;
export const XP_DO = 10;
export const XP_FIRST_TRY = 10;
const LEVELS: [number, string][] = [
  [0, "Apprentice"],
  [200, "Builder"],
  [500, "Foreman"],
];

export function level(xp: number) {
  const index = LEVELS.findLastIndex(([min]) => xp >= min);
  const next = LEVELS[index + 1];
  return { name: LEVELS[index][1], next: next?.[0] ?? null };
}

function read<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const freshProgress = (): Progress => ({
  step: 0,
  xp: 0,
  stars: 0,
  streak: 0,
  mistakes: 0,
  triedThisStep: false,
  startedAt: Date.now(),
  finishedAt: null,
});

export const loadManual = () => read<Manual | null>(MANUAL_KEY, null);
export const saveManual = (m: Manual) => write(MANUAL_KEY, m);
export const loadProgress = () => read<Progress>(PROGRESS_KEY, freshProgress());
const IDLE_MS = 5 * 60_000;

// Only time between taps counts, so a project left open overnight does not read as 2,000 minutes.
export function saveProgress(p: Progress) {
  const now = Date.now();
  p.activeMs = (p.activeMs ?? 0) + Math.min(now - (p.lastAt ?? now), IDLE_MS);
  p.lastAt = now;
  write(PROGRESS_KEY, p);
}

export const minutesOf = (p: Progress) => Math.max(1, Math.round((p.activeMs ?? 0) / 60000));

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const [h, m] = [Math.floor(minutes / 60), minutes % 60];
  return m ? `${h} h ${m} min` : `${h} h`;
}
export const loadBuilds = () => read<Build[]>(BUILDS_KEY, []);
export const saveBuilds = (b: Build[]) => write(BUILDS_KEY, b);

export function clearManual() {
  try {
    localStorage.removeItem(MANUAL_KEY);
    localStorage.removeItem(PROGRESS_KEY);
  } catch {}
  clearReplay();
}

const REPLAY_KEY = "stepsight.replay";
const MAX_FRAMES = 60;

export const loadReplay = () => read<string[]>(REPLAY_KEY, []);
export const addReplayFrame = (frame: string) => write(REPLAY_KEY, [...loadReplay(), frame].slice(-MAX_FRAMES));
export const clearReplay = () => {
  try {
    localStorage.removeItem(REPLAY_KEY);
  } catch {}
};
