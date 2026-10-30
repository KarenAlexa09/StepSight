"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Timber from "../../components/Timber";
import { loadBuilds, type Build } from "../../lib/progress";

const COLORS = ["lavender", "sky", "coral", "mint"];

export default function GalleryPage() {
  const [builds, setBuilds] = useState<Build[]>([]);
  useEffect(() => setBuilds(loadBuilds()), []);

  return (
    <main className="screen paper">
      <header className="top">
        <Link href="/" className="round" aria-label="Home">
          ←
        </Link>
        <span className="chip">{builds.length} builds</span>
      </header>
      <h1 className="title big">Gallery</h1>
      <p className="hand">everything you&apos;ve built, step by step</p>

      {builds.length === 0 ? (
        <div className="empty">
          <Timber pose="wave" size={110} />
          <p className="hand">Nothing here yet. Finish a build and it lands here.</p>
          <Link href="/#ask" className="primary">
            Start a project
          </Link>
        </div>
      ) : (
        <div className="grid">
          {builds.map((b, i) => (
            <div key={b.finishedAt} className={`folder ${COLORS[i % COLORS.length]}`}>
              <span className="tab">#{String(builds.length - i).padStart(3, "0")}</span>
              <span className="folder-title small">{b.title}</span>
              <span className="mono">
                {b.steps} steps · {b.minutes} min
              </span>
              <span className="mono">
                ★ {b.stars} · {b.mistakes} fixed
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
