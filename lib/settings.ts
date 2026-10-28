import { useSyncExternalStore } from "react";

export type Settings = { sound: boolean; quiet: boolean; captions: boolean; vibration: boolean; slow: boolean; big: boolean };

const KEY = "stepsight.settings";
export const DEFAULTS: Settings = { sound: true, quiet: false, captions: true, vibration: true, slow: false, big: false };

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

let current: Settings = typeof window === "undefined" ? DEFAULTS : load();
const subscribers = new Set<() => void>();

export const getSettings = () => current;

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {}
  subscribers.forEach((notify) => notify());
}

export function useSettings() {
  return useSyncExternalStore(
    (notify) => {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
    getSettings,
    () => DEFAULTS,
  );
}
