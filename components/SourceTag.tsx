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
  const url = link(manual.pdf ?? manual.source?.url);
  const name = manual.pdf ? url?.hostname : manual.source?.name || url?.hostname;
  if (!name) return null;
  const label = manual.pdf ? "YOUR PDF" : manual.source?.official ? "OFFICIAL MANUAL" : "WEB GUIDE";
  const text = `${label} · ${name}`;
  return url ? (
    <a className="source" href={url.href} target="_blank" rel="noopener noreferrer">
      {text} ↗
    </a>
  ) : (
    <span className="source">{text}</span>
  );
}
