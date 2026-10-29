"use client";

import { useEffect, useState } from "react";

const FRAME_MS = 2400;

export default function Replay({ frames }: { frames: string[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || frames.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % frames.length), FRAME_MS);
    return () => clearInterval(id);
  }, [playing, frames.length]);

  if (!frames.length) return null;

  return (
    <section className="replay" aria-label="Build replay">
      {frames.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={src} alt={i === index ? `Step ${i + 1} of your build` : ""} className={i === index ? "on" : ""} />
      ))}
      {index > 0 && <span key={index} className="replay-ring" aria-hidden="true" />}
      <span className="chip">
        Build replay · step {index + 1}
      </span>
      <button type="button" className="round play" aria-label={playing ? "Pause replay" : "Play replay"} onClick={() => setPlaying((p) => !p)}>
        {playing ? "❚❚" : "▶"}
      </button>
      <span className="replay-bar" aria-hidden="true">
        {frames.map((_, i) => (
          <span key={i} className={i <= index ? "on" : ""} />
        ))}
      </span>
    </section>
  );
}
