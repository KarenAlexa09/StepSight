"use client";

import { useT } from "../../lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import Timber from "../../components/Timber";
import { formatMinutes, level, loadBuilds, loadProgress, type Build } from "../../lib/progress";

export default function GalleryPage() {
  const t = useT();
  const [builds, setBuilds] = useState<Build[]>([]);
  const [xp, setXp] = useState(0);
  useEffect(() => {
    setBuilds(loadBuilds());
    setXp(loadProgress().xp);
  }, []);

  return (
    <main className="screen c">
      <header className="c-top">
        <span className="c-muted" style={{ fontSize: 13 }}>
          {t("{n} projects · {xp} XP", { n: builds.length, xp })}
        </span>
        <span className="chip hi">{t(level(xp).name)}</span>
      </header>
      <div className="c-ask" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="c-h1" style={{ fontSize: 34, lineHeight: "40px" }}>
            {t("Gallery")}
          </h1>
          <p className="c-muted">{t("Everything you built and fixed.")}</p>
        </div>
        <Timber pose="thumbs" size={64} move="none" />
      </div>

      <div className="c-gallery">
        {builds.map((b) => (
          <div key={b.finishedAt} className="c-card">
            <span className="c-card-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b.photo ? <img src={b.photo} alt="" /> : <Timber pose="celebrate" size={96} move="none" />}
              <span className="c-tag">{b.mode === "fix" ? t("FIX") : t("BUILD")}</span>
            </span>
            <b>{b.title}</b>
            <small>
              {t("{n} steps · {time}", { n: b.steps, time: formatMinutes(b.minutes) })} · ★ {b.stars}
            </small>
          </div>
        ))}
        <Link href="/#ask" className="c-card-new">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t("Your next project")}
        </Link>
      </div>
    </main>
  );
}
