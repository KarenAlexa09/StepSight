"use client";

import { useT } from "../../lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import Timber from "../../components/Timber";
import { formatMinutes, loadBuilds, type Build } from "../../lib/progress";

const COLORS = ["lavender", "sky", "coral", "mint"];

export default function GalleryPage() {
  const t = useT();
  const [builds, setBuilds] = useState<Build[]>([]);
  useEffect(() => setBuilds(loadBuilds()), []);

  return (
    <main className="screen paper">
      <header className="top">
        <Link href="/" className="round" aria-label={t("Home")}>
          ←
        </Link>
        <span className="chip">{t("{n} builds", { n: builds.length })}</span>
      </header>
      <h1 className="title big">{t("Gallery")}</h1>
      <p className="hand">{t("everything you've built, step by step")}</p>

      {builds.length === 0 ? (
        <div className="empty">
          <Timber pose="wave" size={110} />
          <p className="hand">{t("Nothing here yet. Finish a build and it lands here.")}</p>
          <Link href="/#ask" className="primary">
            {t("Start a project")}
          </Link>
        </div>
      ) : (
        <div className="grid">
          {builds.map((b, i) => (
            <div key={b.finishedAt} className={`folder ${COLORS[i % COLORS.length]}`}>
              <span className="tab">#{String(builds.length - i).padStart(3, "0")}</span>
              <span className="folder-title small">{b.title}</span>
              <span className="mono">
                {t("{n} steps · {time}", { n: b.steps, time: formatMinutes(b.minutes) })}
              </span>
              <span className="mono">
                {t("★ {stars} · {n} fixed", { stars: b.stars, n: b.mistakes })}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
