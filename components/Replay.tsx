"use client";

import { useEffect, useState } from "react";

const FRAME_MS = 220;

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
      <span className="chip">
        Build replay · step {index + 1}
      </span>
      <button type="button" className="round play" aria-label={playing ? "Pause replay" : "Play replay"} onClick={() => setPlaying((p) => !p)}>
        {playing ? "❚❚" : "▶"}
      </button>
    </section>
  );
}
