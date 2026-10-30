import { useT } from "../lib/i18n";
import type { Manual } from "../lib/manual";

function link(url: string | undefined) {
  try {
    const parsed = new URL(url ?? "");
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

export default function SourceTag({ manual }: { manual: Manual }) {
  const t = useT();
  const url = link(manual.pdf ?? manual.source?.url);
  const name = manual.pdf ? url?.hostname : manual.source?.name || url?.hostname;
  if (!name) return null;
  const label = manual.pdf ? t("YOUR PDF") : manual.source?.official ? t("OFFICIAL MANUAL") : manual.source?.specific === false ? t("GENERIC GUIDE") : t("WEB GUIDE");
  const text = `${label} · ${name}`;
  return url ? (
    <a className="source" href={url.href} target="_blank" rel="noopener noreferrer">
      {text} ↗
    </a>
  ) : (
    <span className="source">{text}</span>
  );
}
