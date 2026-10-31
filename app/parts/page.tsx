"use client";

import { useT } from "../../lib/i18n";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fileToShot, maskTransform, type Shot } from "../../lib/image";
import { MANUAL_KEY, type Manual } from "../../lib/manual";
import type { Match } from "../../lib/sam";

type Result = Match[] | "error";

export default function PartsPage() {
  const t = useT();
  const [manual, setManual] = useState<Manual | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MANUAL_KEY);
      if (saved) setManual(JSON.parse(saved));
    } catch {}
  }, []);

  const needed = useMemo(() => {
    const totals = new Map<string, number>();
    for (const step of manual?.steps ?? []) {
      for (const p of step.parts) {
        const color = p.color.trim().toLowerCase();
        totals.set(color, (totals.get(color) ?? 0) + p.quantity);
      }
    }
    return [...totals].sort((a, b) => b[1] - a[1]);
  }, [manual]);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    let next: Shot;
    try {
      next = await fileToShot(file);
    } catch {
      setError(t("Couldn't open that photo. Try another one."));
      return;
    }
    setError("");
    setShot(next);
    setResults({});
    setSelected(null);
    await Promise.all(
      needed.map(async ([color]) => {
        let result: Result = "error";
        try {
          const res = await fetch("/api/segment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: next.image, prompt: `${color} piece` }),
          });
          if (res.ok) result = (await res.json()).matches;
        } catch {}
        setResults((prev) => ({ ...prev, [color]: result }));
      }),
    );
  }

  const checked = Object.keys(results).length;
  const short = needed.filter(([color, count]) => {
    const r = results[color];
    return Array.isArray(r) && r.length < count;
  });
  const highlighted = selected && Array.isArray(results[selected]) ? (results[selected] as Match[]) : [];

  if (!manual) {
    return (
      <main className="screen c">
        <h1 className="c-h1">{t("Add a manual first")}</h1>
        <Link className="c-btn" href="/#ask">
          {t("Add a manual")}
        </Link>
      </main>
    );
  }

  // With no color picked, outline every part found.
  const outlined = selected ? highlighted : Object.values(results).flatMap((r) => (Array.isArray(r) ? r : []));
  const camera = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );

  return (
    <main className="screen c">
      <header className="c-top">
        <Link href="/manual" className="c-back" aria-label={t("Back")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <span className="c-muted" role="status" style={{ fontSize: 13 }}>
          {shot ? t("{n} of {total} colors complete", { n: needed.filter(([c, n]) => (results[c]?.length ?? 0) >= n && Array.isArray(results[c])).length, total: needed.length }) : t("Parts check")}
        </span>
      </header>

      <h1 className="c-h1" style={{ fontSize: 28, lineHeight: "34px" }}>
        {t("Let's check the parts")}
      </h1>

      <div className="c-parts-photo">
        {shot ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.image} alt={t("Your parts")} />
            <svg viewBox={`0 0 ${shot.width} ${shot.height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              {outlined.map((m, i) => (
                <path key={i} d={m.path} transform={maskTransform(m)} className="mask" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
          </>
        ) : (
          <label className="c-parts-empty">
            {camera}
            {t("Take one photo from above with every part visible.")}
            <input type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
        )}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {shot && (
        <>
          <ul className="c-colors">
            {needed.map(([color, count]) => {
              const r = results[color];
              const found = Array.isArray(r) ? r.length : null;
              return (
                <li key={color}>
                  <button type="button" aria-pressed={selected === color} onClick={() => setSelected(selected === color ? null : color)} disabled={!found}>
                    <span className="c-swatch" style={{ background: color.replace(/\s+/g, "") }} />
                    <span className="c-grow">{color}</span>
                    {r === undefined ? (
                      <span className="c-muted">{t("looking…")}</span>
                    ) : r === "error" ? (
                      <span className="c-muted">{t("couldn't check")}</span>
                    ) : found! >= count ? (
                      <>
                        <span className="c-muted">{t("{seen} of {n}", { seen: count, n: count })}</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={t("Complete")}>
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      </>
                    ) : (
                      <span className="c-badge">{t("Missing {n}", { n: count - found! })}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="c-muted" style={{ fontSize: 13 }}>
            {short.length
              ? t("Check the bottom of the box. If it doesn't turn up, you can carry on anyway.")
              : checked === needed.length
                ? t("Looks like everything is here.")
                : t("Counts are a guide, not exact: pieces that touch or hide under others can count as one.")}
          </p>
        </>
      )}

      <div className="c-grow" />
      <div className="c-sticky">
        <label className="c-side" aria-label={shot ? t("Retake photo") : t("Take photo")} style={{ flex: "none", width: 56, height: 56, borderRadius: 28 }}>
          {camera}
          <input type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
        <Link href="/build" className="c-btn">
          {t("Start building")}
        </Link>
      </div>
    </main>
  );
}
