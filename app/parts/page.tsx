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
      <main className="screen paper">
        <h1 className="title">{t("Add a manual first")}</h1>
        <Link className="primary" href="/#ask">
          {t("Add a manual")}
        </Link>
      </main>
    );
  }

  return (
    <main className="screen paper">
      <header className="top">
        <Link href="/" className="round" aria-label={t("Home")}>
          ←
        </Link>
        <span className="chip" role="status">
          {shot ? t("{n}/{total} colors checked", { n: checked, total: needed.length }) : t("Parts check")}
        </span>
      </header>

      <h1 className="title">{t("Spread your parts on the table")}</h1>

      <div className="stage">
        {shot ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.image} alt={t("Your parts")} className="media" />
            <svg className="media overlay" viewBox={`0 0 ${shot.width} ${shot.height}`} aria-hidden="true">
              {highlighted.map((m) => (
                <path key={m.id} d={m.path} transform={maskTransform(m)} className="mask" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
          </>
        ) : (
          <p className="hint">{t("Take one photo from above with every part visible.")}</p>
        )}
      </div>

      <label className="primary upload">
        {shot ? t("Retake photo") : t("Take photo")}
        <input type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} />
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {shot && (
        <>
          {checked === needed.length && (
            <p className={short.length ? "error" : "ok"} role="alert">
              {short.length
                ? t("Timber may be missing parts in {n} color(s). Check the bottom of the box.", { n: short.length })
                : t("Looks like everything is here.")}
            </p>
          )}
          <ul className="colors">
            {needed.map(([color, count]) => {
              const r = results[color];
              const found = Array.isArray(r) ? r.length : null;
              return (
                <li key={color}>
                  <button
                    type="button"
                    aria-pressed={selected === color}
                    onClick={() => setSelected(selected === color ? null : color)}
                    disabled={!found}
                  >
                    <span>{color}</span>
                    <span className="count">
                      {r === undefined ? t("looking…") : r === "error" ? t("couldn't check") : t("{seen} seen · {n} needed", { seen: found, n: count })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="tip">
            {t("Counts are a guide, not exact: pieces that touch or hide under others can count as one.")}
          </p>
        </>
      )}
    </main>
  );
}
