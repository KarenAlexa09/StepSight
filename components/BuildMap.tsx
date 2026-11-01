"use client";

import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { fileToShot, maskTransform, toShot, type Shot } from "../lib/image";
import type { Match } from "../lib/sam";
import SourceTag from "./SourceTag";
import type { Manual } from "../lib/manual";

export type MapItem = { badge: string; prompt: string; text: string };

const loadShot = (src: string) =>
  new Promise<Shot>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(toShot(img, img.naturalWidth, img.naturalHeight));
    img.onerror = reject;
    img.src = src;
  });

// Before Flow starts: what it becomes, and every part on the table numbered in the order it's used.
export default function BuildMap({
  manual,
  items,
  photo,
  finished,
  onStart,
}: {
  manual: Manual;
  items: MapItem[];
  photo?: string;
  finished?: string;
  onStart: () => void;
}) {
  const t = useT();
  const [shot, setShot] = useState<Shot | null>(null);
  const [found, setFound] = useState<Record<string, Match | null>>({});
  const [preview, setPreview] = useState(finished ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    if (photo) loadShot(photo).then(scan, () => setError(t("Couldn't open that photo. Try another one.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);

  async function scan(next: Shot) {
    setShot(next);
    setFound({});
    setError("");
    if (!finished) {
      setPreview("");
      fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: next.image, title: `${manual.title}: ${manual.steps.map((s) => s.instruction).join(" ")}` }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data?.image && setPreview(data.image))
        .catch(() => {});
    }
    await Promise.all(
      items.map(async (item) => {
        let match: Match | null = null;
        try {
          const res = await fetch("/api/segment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: next.image, prompt: item.prompt, width: next.width, height: next.height }),
          });
          if (res.ok) match = (await res.json()).matches?.[0] ?? null;
        } catch {}
        setFound((prev) => ({ ...prev, [item.badge]: match }));
      }),
    );
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      await scan(await fileToShot(file));
    } catch {
      setError(t("Couldn't open that photo. Try another one."));
    }
  }

  const done = Object.keys(found).length;
  const seen = Object.values(found).filter(Boolean).length;
  const scanning = Boolean(shot) && done < items.length;
  const r = shot ? Math.round(shot.width * 0.04) : 0;

  return (
    <main className="screen c">
      <div className="c-ask">
        <div className="c-grow">
          <p className="kicker">{t("YOUR BUILD MAP · {n} PARTS", { n: items.length })}</p>
          <h1 className="c-h1" style={{ marginTop: 6 }}>
            {manual.title}
          </h1>
        </div>
        <figure className="c-map-goal">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt={t("What it looks like finished")} /> : <span className="c-dots" aria-hidden="true"><i /><i /><i /></span>}
          <figcaption>{finished ? t("Finished") : t("Preview, may differ")}</figcaption>
        </figure>
      </div>
      <SourceTag manual={manual} />

      <div className="c-parts-photo">
        {shot ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.image} alt={t("Your parts")} />
            <svg viewBox={`0 0 ${shot.width} ${shot.height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              {items.map((item) => {
                const m = found[item.badge];
                if (!m) return null;
                return (
                  <g key={item.badge}>
                    <path d={m.path} transform={maskTransform(m)} className="mask" vectorEffect="non-scaling-stroke" />
                    <circle cx={m.bounds.left + r} cy={m.bounds.top + r} r={r} className="c-map-badge" />
                    <text x={m.bounds.left + r} y={m.bounds.top + r} className="c-map-num" fontSize={r * 1.1}>
                      {item.badge}
                    </text>
                  </g>
                );
              })}
            </svg>
            {scanning && <span className="scan" aria-hidden="true" />}
          </>
        ) : (
          <label className="c-parts-empty">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            {t("Take one photo from above with every part visible.")}
            <input type="file" accept="image/*" capture="environment" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        )}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {shot && (
        <p className="c-muted" role="status">
          {scanning ? t("Mapping your parts…") : t("Found {seen} of {n} parts", { seen, n: items.length })}
        </p>
      )}
      <ol className="c-map-list">
        {items.map((item) => (
          <li key={item.badge} className={found[item.badge] === null ? "missing" : ""}>
            <b>{item.badge}</b>
            <span>{item.text}</span>
          </li>
        ))}
      </ol>

      <div className="c-grow" />
      <div className="c-sticky">
        <button type="button" className="c-btn" onClick={onStart} disabled={scanning}>
          {t("Start: grab part 1")}
        </button>
      </div>
    </main>
  );
}
