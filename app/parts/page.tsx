"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fileToShot, maskTransform, type Shot } from "../../lib/image";
import { MANUAL_KEY, type Manual } from "../../lib/manual";
import type { Match } from "../../lib/sam";

type Result = Match[] | "error";

export default function PartsPage() {
  const [manual, setManual] = useState<Manual | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [selected, setSelected] = useState<string | null>(null);

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
    const next = await fileToShot(file);
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
      <main className="screen">
        <h1 className="title">Add a manual first</h1>
        <Link className="primary" href="/manual">
          Add a manual
        </Link>
      </main>
    );
  }

  return (
    <main className="screen">
      <header className="top">
        <Link href="/manual" className="brand">
          StepSight
        </Link>
        <span className="chip" role="status">
          {shot ? `${checked}/${needed.length} colors checked` : "Parts check"}
        </span>
      </header>

      <h1 className="title">Spread your parts on the table</h1>

      <div className="stage">
        {shot ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.image} alt="Your parts" className="media" />
            <svg className="media overlay" viewBox={`0 0 ${shot.width} ${shot.height}`} aria-hidden="true">
              {highlighted.map((m) => (
                <path key={m.id} d={m.path} transform={maskTransform(m)} className="mask" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
          </>
        ) : (
          <p className="hint">Take one photo from above with every part visible.</p>
        )}
      </div>

      <label className="primary upload">
        {shot ? "Retake photo" : "Take photo"}
        <input type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} />
      </label>

      {shot && (
        <>
          {checked === needed.length && (
            <p className={short.length ? "error" : "ok"} role="alert">
              {short.length
                ? `Timber may be missing parts in ${short.length} color${short.length > 1 ? "s" : ""}. Check the bottom of the box.`
                : "Looks like everything is here."}
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
                      {r === undefined ? "looking…" : r === "error" ? "couldn't check" : `${found} seen · ${count} needed`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="tip">
            Counts are a guide, not exact: pieces that touch or hide under others can count as one.
          </p>
        </>
      )}
    </main>
  );
}
