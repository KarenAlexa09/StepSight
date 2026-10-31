"use client";

import { useT } from "../lib/i18n";
import { useEffect, useState } from "react";

const FRAME_MS = 220;

export default function Replay({ frames }: { frames: string[] }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || frames.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % frames.length), FRAME_MS);
    return () => clearInterval(id);
  }, [playing, frames.length]);

  if (!frames.length) return null;

  return (
    <section className="replay" aria-label={t("Build replay")}>
      {frames.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={src} alt={i === index ? t("Step {n} of your build", { n: i + 1 }) : ""} className={i === index ? "on" : ""} />
      ))}
      <button type="button" className="c-pill replay-toggle" aria-label={playing ? t("Pause replay") : t("Play replay")} onClick={() => setPlaying((p) => !p)}>
        <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
        {t("Your replay")}
      </button>
    </section>
  );
}
