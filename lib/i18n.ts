import { ES } from "./es";
import { getSettings, useSettings, type Settings } from "./settings";

type Vars = Record<string, string | number>;

export function translate(lang: Settings["lang"], text: string, vars?: Vars) {
  const out = lang === "es" ? (ES[text] ?? text) : text;
  return vars ? out.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match)) : out;
}

export const tr = (text: string, vars?: Vars) => translate(getSettings().lang, text, vars);

export function useT() {
  const { lang } = useSettings();
  return (text: string, vars?: Vars) => translate(lang, text, vars);
}
